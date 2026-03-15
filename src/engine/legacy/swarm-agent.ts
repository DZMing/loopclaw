/**
 * 🦞 龙虾群体智能代理
 *
 * 实现群体模式（Swarm Pattern）用于去中心化多代理协作
 * 基于 2026 AI Agent 架构最佳实践
 *
 * @see {@link https://www.linkedin.com/posts/rakeshgohel01_2026-will-be-dominated-by-multi-ai-agent-activity-7429507169173028865-FDFr}
 * @see {@link https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/}
 */

import type { Blackboard } from "./blackboard.js";

/**
 * 代理消息
 */
export interface AgentMessage {
  /** 消息ID */
  id: string;
  /** 发送者ID */
  from: string;
  /** 接收者ID（空表示广播） */
  to?: string;
  /** 消息类型 */
  type: string;
  /** 消息内容 */
  payload: any;
  /** 时间戳 */
  timestamp: number;
  /** TTL（跳数） */
  ttl?: number;
}

/**
 * 群体成员状态
 */
export interface SwarmMemberState {
  /** 成员ID */
  id: string;
  /** 角色 */
  role: "worker" | "scout" | "coordinator" | "specialist";
  /** 状态 */
  status: "active" | "idle" | "busy" | "offline";
  /** 能力评分 (0-1) */
  capability: number;
  /** 负载 (0-1) */
  load: number;
  /** 位置（虚拟空间坐标） */
  position: { x: number; y: number; z: number };
  /** 邻居列表 */
  neighbors: Set<string>;
  /** 当前任务 */
  currentTask?: string;
}

/**
 * 群体配置
 */
export interface SwarmConfig {
  /** 成员数量 */
  memberCount?: number;
  /** 感知半径（虚拟空间） */
  perceptionRadius?: number;
  /** 通信半径 */
  communicationRadius?: number;
  /** 启用去中心化协调 */
  enableDecentralizedCoord?: boolean;
  /** 启用自适应成员数 */
  enableAutoScaling?: boolean;
  /** 最小成员数 */
  minMembers?: number;
  /** 最大成员数 */
  maxMembers?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<SwarmConfig> = {
  memberCount: 10,
  perceptionRadius: 100,
  communicationRadius: 150,
  enableDecentralizedCoord: true,
  enableAutoScaling: true,
  minMembers: 3,
  maxMembers: 50,
};

/**
 * 群体任务
 */
export interface SwarmTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: string;
  /** 任务数据 */
  data: any;
  /** 优先级 */
  priority: number;
  /** 所需能力 */
  requiredCapability?: number;
  /** 创建时间 */
  createdAt: number;
  /** 分配给的成员 */
  assignedTo?: Set<string>;
  /** 进度 (0-1) */
  progress: number;
  /** 状态 */
  status: "pending" | "in_progress" | "completed" | "failed";
}

/**
 * 群体统计
 */
export interface SwarmStatistics {
  /** 总成员数 */
  totalMembers: number;
  /** 活跃成员数 */
  activeMembers: number;
  /** 空闲成员数 */
  idleMembers: number;
  /** 平均负载 */
  avgLoad: number;
  /** 平均能力 */
  avgCapability: number;
  /** 任务完成率 */
  taskCompletionRate: number;
  /** 消息吞吐量 */
  messageThroughput: number;
}

/**
 * 群体智能代理
 *
 * 实现去中心化的多代理协作系统
 */
export class SwarmAgent {
  private members: Map<string, SwarmMemberState> = new Map();
  private tasks: Map<string, SwarmTask> = new Map();
  private messages: AgentMessage[] = [];
  private config: Required<SwarmConfig>;
  private blackboard?: Blackboard;
  private isRunning = false;
  private messageStats = { sent: 0, received: 0, delivered: 0 };

  // 任务处理函数映射
  private taskHandlers: Map<
    string,
    (task: SwarmTask, member: SwarmMemberState) => Promise<void>
  > = new Map();

  constructor(config: SwarmConfig = {}, blackboard?: Blackboard) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.blackboard = blackboard;

    // 初始化群体成员
    this.initializeSwarm();
  }

  /**
   * 初始化群体
   */
  private initializeSwarm(): void {
    for (let i = 0; i < this.config.memberCount; i++) {
      const member: SwarmMemberState = {
        id: `member_${i}`,
        role: this.assignRole(i),
        status: "idle",
        capability: Math.random(), // 随机能力值
        load: 0,
        position: {
          x: Math.random() * this.config.perceptionRadius * 2,
          y: Math.random() * this.config.perceptionRadius * 2,
          z: Math.random() * this.config.perceptionRadius * 2,
        },
        neighbors: new Set(),
      };
      this.members.set(member.id, member);
    }

    // 计算邻居关系
    this.updateNeighbors();
  }

  /**
   * 分配角色
   */
  private assignRole(index: number): SwarmMemberState["role"] {
    const roles: SwarmMemberState["role"][] = [
      "worker",
      "worker",
      "worker",
      "worker",
      "worker",
      "scout",
      "scout",
      "coordinator",
      "specialist",
      "specialist",
    ];
    return roles[index % roles.length];
  }

  /**
   * 更新邻居关系
   */
  private updateNeighbors(): void {
    for (const member of this.members.values()) {
      member.neighbors.clear();

      for (const other of this.members.values()) {
        if (member.id === other.id) {
          continue;
        }

        const distance = this.calculateDistance(
          member.position,
          other.position,
        );
        if (distance <= this.config.communicationRadius) {
          member.neighbors.add(other.id);
        }
      }
    }
  }

  /**
   * 计算距离
   */
  private calculateDistance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2),
    );
  }

  /**
   * 启动群体
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`🦞 群体智能代理已启动 (${this.members.size} 个成员)`);

    // 主循环
    this.swarmLoop();
  }

  /**
   * 停止群体
   */
  stop(): void {
    this.isRunning = false;
    console.log("🦞 群体智能代理已停止");
  }

  /**
   * 添加任务
   */
  addTask(
    task: Omit<SwarmTask, "id" | "createdAt" | "progress" | "status">,
  ): string {
    const taskWithId: SwarmTask = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      progress: 0,
      status: "pending",
      assignedTo: new Set(),
    };

    this.tasks.set(taskWithId.id, taskWithId);

    // 通过黑板广播任务
    if (this.blackboard) {
      this.blackboard.write(
        `swarm_task:${taskWithId.id}`,
        taskWithId,
        "swarm",
        { tags: ["swarm", "task", task.type] },
      );
    }

    // 触发任务分配
    this.assignTask(taskWithId);

    return taskWithId.id;
  }

  /**
   * 分配任务
   */
  private assignTask(task: SwarmTask): void {
    // 找到最合适的成员
    const bestMember = this.findBestMember(task);

    if (bestMember) {
      bestMember.currentTask = task.id;
      bestMember.status = "busy";
      bestMember.load = Math.min(1, bestMember.load + 0.3);

      task.assignedTo?.add(bestMember.id) ??
        (task.assignedTo = new Set([bestMember.id]));
      task.status = "in_progress";

      console.log(`🦞 任务 ${task.id} 分配给 ${bestMember.id}`);

      // 执行任务
      this.executeTask(task, bestMember);
    }
  }

  /**
   * 找到最佳成员
   */
  private findBestMember(task: SwarmTask): SwarmMemberState | undefined {
    let bestMember: SwarmMemberState | undefined;
    let bestScore = -1;

    for (const member of this.members.values()) {
      if (member.status !== "idle" && member.status !== "active") {
        continue;
      }

      // 检查能力要求
      if (
        task.requiredCapability &&
        member.capability < task.requiredCapability
      ) {
        continue;
      }

      // 计算适配度分数
      const score = this.calculateFitnessScore(member, task);
      if (score > bestScore) {
        bestScore = score;
        bestMember = member;
      }
    }

    return bestMember;
  }

  /**
   * 计算适配度分数
   */
  private calculateFitnessScore(
    member: SwarmMemberState,
    task: SwarmTask,
  ): number {
    let score = 0;

    // 能力匹配 (40%)
    score += member.capability * 0.4;

    // 负载反向 (30%)
    score += (1 - member.load) * 0.3;

    // 距离因素 (20%)
    if (task.data?.position) {
      const distance = this.calculateDistance(
        member.position,
        task.data.position,
      );
      score +=
        Math.max(0, 1 - distance / this.config.communicationRadius) * 0.2;
    } else {
      score += 0.2;
    }

    // 邻居推荐 (10%)
    const neighborRecommendations = Array.from(member.neighbors).filter(
      (id) => {
        const neighbor = this.members.get(id);
        return (
          neighbor &&
          neighbor.status === "busy" &&
          neighbor.currentTask === task.id
        );
      },
    ).length;
    score += Math.min(1, neighborRecommendations / 3) * 0.1;

    return score;
  }

  /**
   * 执行任务
   */
  private async executeTask(
    task: SwarmTask,
    member: SwarmMemberState,
  ): Promise<void> {
    try {
      const handler = this.taskHandlers.get(task.type);
      if (handler) {
        await handler(task, member);
      } else {
        // 默认任务处理
        await this.defaultTaskHandler(task, member);
      }

      // 任务完成
      task.progress = 1;
      task.status = "completed";

      if (this.blackboard) {
        this.blackboard.write(
          `swarm_task_result:${task.id}`,
          { taskId: task.id, result: "completed", member: member.id },
          "swarm",
          { tags: ["swarm", "result"] },
        );
      }
    } catch (error) {
      console.error(`🦞 成员 ${member.id} 执行任务失败:`, error);
      task.status = "failed";
    } finally {
      // 重置成员状态
      member.status = "active";
      member.currentTask = undefined;
      member.load = Math.max(0, member.load - 0.3);
    }
  }

  /**
   * 默认任务处理器
   */
  private async defaultTaskHandler(
    task: SwarmTask,
    member: SwarmMemberState,
  ): Promise<void> {
    // 模拟任务执行
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
  }

  /**
   * 注册任务处理器
   */
  registerTaskHandler(
    type: string,
    handler: (task: SwarmTask, member: SwarmMemberState) => Promise<void>,
  ): void {
    this.taskHandlers.set(type, handler);
  }

  /**
   * 广播消息
   */
  broadcast(message: Omit<AgentMessage, "id" | "timestamp">): void {
    const msg: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ttl: message.ttl ?? 5,
    };

    this.messages.push(msg);
    this.messageStats.sent++;

    // 分发给所有成员
    for (const member of this.members.values()) {
      this.deliverMessage(msg, member);
    }

    // 写入黑板
    if (this.blackboard) {
      this.blackboard.write(`swarm_msg:${msg.id}`, msg, "swarm", {
        tags: ["swarm", "message", msg.type],
      });
    }
  }

  /**
   * 发送消息给特定成员
   */
  sendToMember(
    memberId: string,
    message: Omit<AgentMessage, "id" | "timestamp">,
  ): void {
    const member = this.members.get(memberId);
    if (!member) {
      return;
    }

    const msg: AgentMessage = {
      ...message,
      to: memberId,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ttl: message.ttl ?? 5,
    };

    this.deliverMessage(msg, member);
  }

  /**
   * 投递消息
   */
  private deliverMessage(
    message: AgentMessage,
    member: SwarmMemberState,
  ): void {
    // 检查TTL
    if (message.ttl !== undefined && message.ttl <= 0) {
      return;
    }

    // 处理消息
    this.messageStats.delivered++;
    this.messageStats.received++;

    // 触发消息处理
    this.handleMessage(message, member);
  }

  /**
   * 处理消息
   */
  private handleMessage(message: AgentMessage, member: SwarmMemberState): void {
    switch (message.type) {
      case "task_update":
        // 更新任务状态
        this.handleTaskUpdate(message.payload);
        break;

      case "member_status":
        // 更新成员状态
        this.handleMemberStatus(message.payload);
        break;

      case "coordination":
        // 去中心化协调
        if (this.config.enableDecentralizedCoord) {
          this.handleCoordination(message, member);
        }
        break;

      default:
        // 自定义消息处理
        break;
    }
  }

  /**
   * 处理任务更新
   */
  private handleTaskUpdate(payload: any): void {
    const { taskId, status, progress } = payload;
    const task = this.tasks.get(taskId);

    if (task) {
      if (status) {
        task.status = status;
      }
      if (progress !== undefined) {
        task.progress = progress;
      }
    }
  }

  /**
   * 处理成员状态
   */
  private handleMemberStatus(payload: any): void {
    const { memberId, status, load, position } = payload;
    const member = this.members.get(memberId);

    if (member) {
      if (status) {
        member.status = status;
      }
      if (load !== undefined) {
        member.load = load;
      }
      if (position) {
        member.position = position;
      }
    }
  }

  /**
   * 处理协调消息
   */
  private handleCoordination(
    message: AgentMessage,
    member: SwarmMemberState,
  ): void {
    const { action, data } = message.payload;

    switch (action) {
      case "request_help":
        // 请求帮助
        this.offerHelp(member, data);
        break;

      case "share_work":
        // 分享工作
        this.distributeWork(member, data);
        break;

      case "report_position":
        // 报告位置（用于自适应移动）
        this.updateMemberPosition(member, data.position);
        break;
    }
  }

  /**
   * 提供帮助
   */
  private offerHelp(requester: SwarmMemberState, data: any): void {
    const taskId = data.taskId;
    const task = this.tasks.get(taskId);

    if (task && task.status === "in_progress") {
      // 找到空闲的邻居成员
      for (const neighborId of requester.neighbors) {
        const neighbor = this.members.get(neighborId);
        if (neighbor && neighbor.status === "idle") {
          // 分配任务
          this.assignTask(task);
          break;
        }
      }
    }
  }

  /**
   * 分发工作
   */
  private distributeWork(member: SwarmMemberState, data: any): void {
    // 成员有多余任务，分发给邻居
    if (member.load > 0.7) {
      for (const neighborId of member.neighbors) {
        const neighbor = this.members.get(neighborId);
        if (neighbor && neighbor.status === "idle" && neighbor.load < 0.5) {
          // 找到可转移的任务
          for (const task of this.tasks.values()) {
            if (
              task.assignedTo?.has(member.id) &&
              task.status === "in_progress"
            ) {
              // 转移任务
              task.assignedTo.delete(member.id);
              task.assignedTo.add(neighborId);
              neighbor.currentTask = task.id;
              neighbor.status = "busy";
              neighbor.load += 0.3;

              console.log(
                `🦞 任务 ${task.id} 从 ${member.id} 转移到 ${neighborId}`,
              );
              break;
            }
          }
          break;
        }
      }
    }
  }

  /**
   * 更新成员位置
   */
  private updateMemberPosition(
    member: SwarmMemberState,
    position: { x: number; y: number; z: number },
  ): void {
    member.position = position;
    this.updateNeighbors();
  }

  /**
   * 群体主循环
   */
  private async swarmLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // 自适应调整成员数
        if (this.config.enableAutoScaling) {
          this.autoScale();
        }

        // 清理旧消息
        this.cleanupMessages();

        // 让出控制权
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error) {
        console.error("🦞 群体循环错误:", error);
      }
    }
  }

  /**
   * 自适应调整成员数
   */
  private autoScale(): void {
    const activeMembers = Array.from(this.members.values()).filter(
      (m) => m.status === "active" || m.status === "busy",
    ).length;
    const avgLoad =
      Array.from(this.members.values()).reduce((sum, m) => sum + m.load, 0) /
      this.members.size;
    const pendingTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending",
    ).length;

    // 负载高且待处理任务多 -> 扩容
    if (
      avgLoad > 0.7 &&
      pendingTasks > 3 &&
      this.members.size < this.config.maxMembers
    ) {
      this.addMember();
    }
    // 负载低且成员数多 -> 缩容
    else if (avgLoad < 0.2 && this.members.size > this.config.minMembers) {
      this.removeMember();
    }
  }

  /**
   * 添加成员
   */
  private addMember(): void {
    const newId = `member_${this.members.size}`;
    const member: SwarmMemberState = {
      id: newId,
      role: this.assignRole(this.members.size),
      status: "idle",
      capability: Math.random(),
      load: 0,
      position: {
        x: Math.random() * this.config.perceptionRadius * 2,
        y: Math.random() * this.config.perceptionRadius * 2,
        z: Math.random() * this.config.perceptionRadius * 2,
      },
      neighbors: new Set(),
    };

    this.members.set(newId, member);
    this.updateNeighbors();

    console.log(
      `🦞 群体扩容: 新成员 ${newId} (当前 ${this.members.size} 个成员)`,
    );
  }

  /**
   * 移除成员
   */
  private removeMember(): void {
    // 找到负载最低的成员
    let candidate: SwarmMemberState | undefined;
    let lowestLoad = 1;

    for (const member of this.members.values()) {
      if (member.status === "idle" && member.load < lowestLoad) {
        lowestLoad = member.load;
        candidate = member;
      }
    }

    if (candidate && this.members.size > this.config.minMembers) {
      this.members.delete(candidate.id);
      this.updateNeighbors();

      console.log(
        `🦞 群体缩容: 移除成员 ${candidate.id} (当前 ${this.members.size} 个成员)`,
      );
    }
  }

  /**
   * 清理旧消息
   */
  private cleanupMessages(): void {
    const now = Date.now();
    const maxAge = 60000; // 1分钟

    this.messages = this.messages.filter((msg) => {
      const age = now - msg.timestamp;
      return age < maxAge;
    });
  }

  /**
   * 获取统计信息
   */
  getStatistics(): SwarmStatistics {
    const members = Array.from(this.members.values());
    const activeMembers = members.filter(
      (m) => m.status === "active" || m.status === "busy",
    ).length;
    const idleMembers = members.filter((m) => m.status === "idle").length;
    const avgLoad =
      members.reduce((sum, m) => sum + m.load, 0) / members.length;
    const avgCapability =
      members.reduce((sum, m) => sum + m.capability, 0) / members.length;

    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    const taskCompletionRate =
      tasks.length > 0 ? completedTasks / tasks.length : 1;

    return {
      totalMembers: this.members.size,
      activeMembers,
      idleMembers,
      avgLoad,
      avgCapability,
      taskCompletionRate,
      messageThroughput: this.messageStats.delivered,
    };
  }

  /**
   * 获取成员状态
   */
  getMemberState(memberId: string): SwarmMemberState | undefined {
    return this.members.get(memberId);
  }

  /**
   * 获取所有成员状态
   */
  getAllMemberStates(): Map<string, SwarmMemberState> {
    return new Map(this.members);
  }

  /**
   * 设置黑板
   */
  setBlackboard(blackboard: Blackboard): void {
    this.blackboard = blackboard;
  }
}

/**
 * 创建群体智能代理
 */
export function createSwarmAgent(
  config?: SwarmConfig,
  blackboard?: Blackboard,
): SwarmAgent {
  return new SwarmAgent(config, blackboard);
}
