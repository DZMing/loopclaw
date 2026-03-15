/**
 * 🦞 Worker 脚本
 *
 * 在独立线程中执行 CPU 密集型任务
 */

import { parentPort } from "worker_threads";

/**
 * 任务处理器映射
 */
const taskHandlers = new Map();

/**
 * 注册任务处理器
 */
function registerTask(type, handler) {
  taskHandlers.set(type, handler);
}

// 示例任务：AST 分析
registerTask("analyzeAST", (data) => {
  const { code, filePath } = data;
  // 简化示例：返回代码行数
  return {
    lineCount: code.split("\n").length,
    functionCount: (code.match(/function\s+\w+/g) || []).length,
    classCount: (code.match(/class\s+\w+/g) || []).length,
  };
});

// 示例任务：复杂度计算
registerTask("calculateComplexity", (data) => {
  const { code } = data;
  // 简化示例：返回复杂度估算
  return {
    complexity: code.split("\n").length / 10,
  };
});

/**
 * 处理任务
 */
async function processTask(task) {
  const { id, type, data } = task;

  try {
    const handler = taskHandlers.get(type);
    if (!handler) {
      throw new Error(`未知任务类型: ${type}`);
    }

    const result = await handler(data);

    parentPort?.postMessage({
      id,
      success: true,
      value: result,
    });
  } catch (error) {
    parentPort?.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 监听主线程消息
 */
if (parentPort) {
  parentPort.on("message", (task) => {
    processTask(task);
  });
}
