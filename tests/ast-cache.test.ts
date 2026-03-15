import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LRUCache,
  FileAnalysisCache,
  memoize,
  memoizeAsync,
  createIncrementalConfig,
  detectFileChanges,
} from "../src/engine/ast-cache.js";

describe("LRUCache", () => {
  describe("基础 get/set", () => {
    it("set 后可以 get", () => {
      const cache = new LRUCache<string, number>();
      cache.set("a", 1);
      assert.equal(cache.get("a"), 1);
    });

    it("不存在的 key 返回 undefined", () => {
      const cache = new LRUCache<string, number>();
      assert.equal(cache.get("missing"), undefined);
    });

    it("set 后统计 size 为 1", () => {
      const cache = new LRUCache<string, string>();
      cache.set("x", "y");
      assert.equal(cache.getStats().size, 1);
    });

    it("多次 get 累计 hits", () => {
      const cache = new LRUCache<string, string>();
      cache.set("k", "v");
      cache.get("k");
      cache.get("k");
      assert.equal(cache.getStats().totalHits, 2);
    });
  });

  describe("TTL 过期", () => {
    it("TTL=-1 时立即过期", () => {
      // ttl 使用 strict >，负值确保条目在 set 后立即过期
      const cache = new LRUCache<string, number>({ ttl: -1 });
      cache.set("k", 99);
      assert.equal(cache.get("k"), undefined);
    });

    it("TTL 内不过期", () => {
      const cache = new LRUCache<string, number>({ ttl: 60000 });
      cache.set("k", 99);
      assert.equal(cache.get("k"), 99);
    });
  });

  describe("LRU 淘汰", () => {
    it("超出 maxSize 时淘汰最少访问的条目", () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.get("b"); // b hits=1
      // 新增 c，容量满，淘汰 hits 最少的 a
      cache.set("c", 3);
      assert.equal(cache.get("a"), undefined);
      assert.equal(cache.get("b"), 2);
      assert.equal(cache.get("c"), 3);
    });
  });

  describe("invalidateIfChanged", () => {
    it("checksum 不变时返回 false，条目保留", () => {
      const cache = new LRUCache<string, string>();
      cache.set("f", "result", "abc123");
      assert.equal(cache.invalidateIfChanged("f", "abc123"), false);
      assert.equal(cache.get("f"), "result");
    });

    it("checksum 变化时返回 true，条目删除", () => {
      const cache = new LRUCache<string, string>();
      cache.set("f", "result", "abc123");
      assert.equal(cache.invalidateIfChanged("f", "newHash"), true);
      assert.equal(cache.get("f"), undefined);
    });

    it("key 不存在时返回 false", () => {
      const cache = new LRUCache<string, string>();
      assert.equal(cache.invalidateIfChanged("missing", "x"), false);
    });
  });

  describe("delete + clear", () => {
    it("delete 删除单个条目", () => {
      const cache = new LRUCache<string, number>();
      cache.set("a", 1);
      cache.set("b", 2);
      cache.delete("a");
      assert.equal(cache.get("a"), undefined);
      assert.equal(cache.get("b"), 2);
    });

    it("clear 清空所有条目", () => {
      const cache = new LRUCache<string, number>();
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      assert.equal(cache.getStats().size, 0);
    });
  });
});

describe("FileAnalysisCache", () => {
  describe("calculateChecksum", () => {
    it("同内容产生相同 checksum", () => {
      const fc = new FileAnalysisCache();
      assert.equal(
        fc.calculateChecksum("hello"),
        fc.calculateChecksum("hello"),
      );
    });

    it("不同内容产生不同 checksum", () => {
      const fc = new FileAnalysisCache();
      assert.notEqual(fc.calculateChecksum("a"), fc.calculateChecksum("b"));
    });

    it("checksum 长度为 16", () => {
      const fc = new FileAnalysisCache();
      assert.equal(fc.calculateChecksum("test").length, 16);
    });
  });

  describe("get/set 流程", () => {
    it("set 后 get 命中", () => {
      const fc = new FileAnalysisCache<string>();
      fc.set("/file.ts", "content", "result");
      assert.equal(fc.get("/file.ts", "content"), "result");
    });

    it("内容变化后 get 返回 undefined（缓存失效）", () => {
      const fc = new FileAnalysisCache<string>();
      fc.set("/file.ts", "old_content", "old_result");
      assert.equal(fc.get("/file.ts", "new_content"), undefined);
    });
  });

  describe("hasValid", () => {
    it("set 后 hasValid 为 true", () => {
      const fc = new FileAnalysisCache<number>();
      fc.set("/f.ts", "code", 42);
      assert.equal(fc.hasValid("/f.ts", "code"), true);
    });

    it("内容变化后 hasValid 为 false", () => {
      const fc = new FileAnalysisCache<number>();
      fc.set("/f.ts", "code", 42);
      assert.equal(fc.hasValid("/f.ts", "changed"), false);
    });
  });

  describe("invalidate + clear", () => {
    it("invalidate 只删除指定文件", () => {
      const fc = new FileAnalysisCache<string>();
      fc.set("/a.ts", "a", "A");
      fc.set("/b.ts", "b", "B");
      fc.invalidate("/a.ts");
      assert.equal(fc.get("/a.ts", "a"), undefined);
      assert.equal(fc.get("/b.ts", "b"), "B");
    });

    it("clear 清空全部", () => {
      const fc = new FileAnalysisCache<string>();
      fc.set("/a.ts", "a", "A");
      fc.clear();
      assert.equal(fc.get("/a.ts", "a"), undefined);
    });
  });
});

describe("memoize", () => {
  it("相同参数返回相同结果（缓存命中）", () => {
    let callCount = 0;
    const add = memoize((a: number, b: number) => {
      callCount++;
      return a + b;
    });
    add(1, 2);
    add(1, 2);
    assert.equal(callCount, 1);
  });

  it("不同参数分别计算", () => {
    let callCount = 0;
    const fn = memoize((x: number) => {
      callCount++;
      return x * 2;
    });
    fn(3);
    fn(4);
    assert.equal(callCount, 2);
  });

  it("自定义 keyFn", () => {
    let callCount = 0;
    const fn = memoize(
      (obj: { id: number }) => {
        callCount++;
        return obj.id;
      },
      (obj) => String(obj.id),
    );
    fn({ id: 1 });
    fn({ id: 1 });
    assert.equal(callCount, 1);
  });
});

describe("memoize — 缓存超过 1000 条时触发清理", () => {
  it("插入 1001 个不同 key 时触发 LRU 清理（不抛出）", () => {
    const fn = memoize(
      (n: number) => n * 2,
      (n) => String(n),
    );
    // 插入 1001 个唯一 key，第 1001 次 set 后 cache.size > 1000，触发清理
    for (let i = 0; i < 1001; i++) {
      fn(i);
    }
    // 清理后 size 应该小于 1001
    // 只验证不抛出、后续调用正常
    const result = fn(9999);
    assert.equal(result, 9999 * 2);
  });
});

describe("memoizeAsync", () => {
  it("相同参数只调用一次", async () => {
    let callCount = 0;
    const fn = memoizeAsync(async (x: number) => {
      callCount++;
      return x * 3;
    });
    await fn(5);
    await fn(5);
    assert.equal(callCount, 1);
  });

  it("自定义 keyFn 使相同参数只调用一次", async () => {
    let callCount = 0;
    const fn = memoizeAsync(
      async (obj: { id: number }) => {
        callCount++;
        return obj.id * 2;
      },
      (obj) => String(obj.id),
    );
    await fn({ id: 7 });
    await fn({ id: 7 });
    assert.equal(callCount, 1);
  });
});

describe("createIncrementalConfig", () => {
  it("返回空的初始配置", () => {
    const cfg = createIncrementalConfig();
    assert.equal(cfg.lastAnalysisTime, 0);
    assert.equal(cfg.analyzedFiles.size, 0);
    assert.deepEqual(cfg.changedFiles, []);
  });
});

describe("detectFileChanges", () => {
  it("全新文件被标记为变更", async () => {
    const cfg = createIncrementalConfig();
    const changed = await detectFileChanges(
      ["/a.ts", "/b.ts"],
      cfg,
      async (p) => p + "-hash",
    );
    assert.deepEqual(changed, ["/a.ts", "/b.ts"]);
  });

  it("相同 checksum 不触发变更", async () => {
    const cfg = createIncrementalConfig();
    // 第一次都算变更
    await detectFileChanges(["/a.ts"], cfg, async () => "hash1");
    // 第二次 checksum 相同，不变更
    const changed = await detectFileChanges(
      ["/a.ts"],
      cfg,
      async () => "hash1",
    );
    assert.deepEqual(changed, []);
  });

  it("checksum 变化时触发变更", async () => {
    const cfg = createIncrementalConfig();
    await detectFileChanges(["/a.ts"], cfg, async () => "hash1");
    const changed = await detectFileChanges(
      ["/a.ts"],
      cfg,
      async () => "hash2",
    );
    assert.deepEqual(changed, ["/a.ts"]);
  });
});
