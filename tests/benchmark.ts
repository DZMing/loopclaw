/**
 * 性能基准测试
 */

import fs from "node:fs/promises";
import path from "node:path";

import { PerpetualEngineService } from "../src/engine/service.js";
import { withTempWorkspace } from "./helpers.js";

const mockApi = {
  logger: {
    info: (msg: string) => {}, // 静默
    warn: (msg: string) => {},
    error: (msg: string) => {},
    debug: (msg: string) => {},
  },
};

async function benchmark() {
  console.log("🏃 性能基准测试\n");

  await withTempWorkspace(
    "lobster-benchmark",
    async ({ workspaceDir, stateDir }) => {
      await fs.writeFile(
        path.join(workspaceDir, "MISSION_PARTNER.md"),
        "# MISSION\n\n- 验证 OpenClaw 宿主路径模型\n",
        "utf-8",
      );

      const mockContext = {
        config: {},
        workspaceDir,
        stateDir,
        logger: mockApi.logger,
      };

      const engine = new PerpetualEngineService(mockApi);
      await engine.start(mockContext);

      // 预热一次真实宿主路径读写，确保 workspaceDir/stateDir 都被触发。
      await engine.readMission();

      const iterations = 1000;
      const startTime = Date.now();

      // 模拟循环
      for (let i = 0; i < iterations; i++) {
        // 这里我们只测试状态查询，不启动实际循环
        engine.getLoopCount();
        engine.getMemoryUsage();
        engine.getErrorStats();
      }

      const elapsed = Date.now() - startTime;
      const opsPerSec = Math.round((iterations / elapsed) * 1000);

      console.log(`迭代次数: ${iterations}`);
      console.log(`总耗时: ${elapsed}ms`);
      console.log(`吞吐量: ${opsPerSec} 次/秒`);
      console.log(`平均延迟: ${(elapsed / iterations).toFixed(3)}ms`);

      await engine.stopLoop();
    },
  );
}

benchmark().catch(console.error);
