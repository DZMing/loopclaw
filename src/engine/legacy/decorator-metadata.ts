/**
 * 🦞 龙虾装饰器元数据工具
 *
 * 基于 TypeScript emitDecoratorMetadata 和 reflect-metadata
 * 实现运行时反射和元数据管理
 *
 * @see {@link https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html}
 * @see {@link https://blog.bitsrc.io/typescripts-reflect-metadata-what-it-is-and-how-to-use-it-fb7b19cfc7e2}
 */

import "reflect-metadata";

/**
 * 元数据键
 */
export const METADATA_KEYS = {
  designType: "design:type",
  paramTypes: "design:paramtypes",
  returnType: "design:returntype",
  custom: "custom:metadata",
};

/**
 * 类型元数据
 */
export interface TypeMetadata {
  /** 类型 */
  type: Function;
  /** 参数类型 */
  paramTypes?: Function[];
  /** 返回类型 */
  returnType?: Function;
}

/**
 * 装饰器元数据
 */
export interface DecoratorMetadata {
  /** 目标类 */
  target: object;
  /** 属性键 */
  propertyKey?: string;
  /** 描述符 */
  descriptor?: PropertyDescriptor;
  /** 自定义数据 */
  customData?: Map<string, any>;
}

/**
 * 反射元数据存储
 */
export class ReflectedMetadata {
  private static metadataStore = new WeakMap<object, Map<string, any>>();

  /**
   * 设置元数据
   */
  static setMetadata(target: object, key: string, value: any): void {
    if (!this.metadataStore.has(target)) {
      this.metadataStore.set(target, new Map());
    }
    this.metadataStore.get(target)!.set(key, value);
  }

  /**
   * 获取元数据
   */
  static getMetadata<T = any>(target: object, key: string): T | undefined {
    const store = this.metadataStore.get(target);
    return store?.get(key) as T;
  }

  /**
   * 获取类型元数据
   */
  static getTypeMetadata(target: object): TypeMetadata | undefined {
    const ReflectExt = Reflect as any;
    const paramTypes = ReflectExt.getMetadata(METADATA_KEYS.paramTypes, target);
    const returnType = ReflectExt.getMetadata(METADATA_KEYS.returnType, target);

    return {
      type: target.constructor,
      paramTypes: paramTypes as Function[],
      returnType,
    };
  }

  /**
   * 获取所有元数据
   */
  static getAllMetadata(target: object): DecoratorMetadata {
    const customData = new Map<string, any>();

    const store = this.metadataStore.get(target);
    if (store) {
      for (const [key, value] of store) {
        customData.set(key, value);
      }
    }

    return {
      target,
      customData,
    };
  }

  /**
   * 检查是否有元数据
   */
  static hasMetadata(target: object, key: string): boolean {
    const store = this.metadataStore.get(target);
    return store?.has(key) || false;
  }

  /**
   * 清除元数据
   */
  static clearMetadata(target: object): void {
    this.metadataStore.delete(target);
  }
}

/**
 * 类装饰器：自动注册元数据
 */
export function RegisterMetadata(
  metadata?: Record<string, any>,
): ClassDecorator {
  return function (target: any) {
    // 注册自定义元数据
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        ReflectedMetadata.setMetadata(target, key, value);
      }
    }

    // 自动收集类型元数据
    const ReflectExt = Reflect as any;
    const paramTypes = ReflectExt.getMetadata(METADATA_KEYS.paramTypes, target);
    const returnType = ReflectExt.getMetadata(METADATA_KEYS.returnType, target);

    console.log(`🏷️ 注册类元数据: ${target.name}`);
  };
}

/**
 * 方法装饰器：记录调用信息
 */
export function LogCalls(options?: {
  logArgs?: boolean;
  logResult?: boolean;
  logTiming?: boolean;
}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const className = target.constructor.name;

      if (options?.logArgs !== false) {
        console.log(`📥 ${className}.${String(propertyKey)} 调用:`, args);
      }

      try {
        const result = await originalMethod.apply(this, args);

        if (options?.logResult !== false) {
          console.log(`📤 ${className}.${String(propertyKey)} 返回:`, result);
        }

        if (options?.logTiming) {
          const duration = Date.now() - startTime;
          console.log(
            `⏱️️ ${className}.${String(propertyKey)} 耗时: ${duration}ms`,
          );
        }

        return result;
      } catch (error) {
        console.error(`❌ ${className}.${String(propertyKey)} 错误:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 参数装饰器：验证参数
 */
export function ValidateParams(
  validationRules?: Record<number, (value: any) => boolean | string>,
): ParameterDecorator {
  return function (
    target: any,
    propertyKey: string | undefined | symbol,
    parameterIndex: number,
  ) {
    // 存储验证规则
    const key = `${target.constructor.name}_${String(propertyKey)}_${parameterIndex}`;
    ReflectedMetadata.setMetadata(target, key, {
      rules: validationRules,
    });

    // 在运行时执行验证（需要在方法装饰器中配合使用）
    console.log(`✅ 参数验证规则已注册: ${key}`);
  };
}

/**
 * 方法装饰器：启用参数验证
 */
export function EnableValidation(): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 获取验证规则
      for (let i = 0; i < args.length; i++) {
        const key = `${target.constructor.name}_${String(propertyKey)}_${i}`;
        const validator = ReflectedMetadata.getMetadata<{
          rules?: Record<number, (value: any) => boolean | string>;
        }>(target, key);

        if (validator?.rules) {
          for (const [paramIndex, rule] of Object.entries(validator.rules)) {
            const result = rule(args[i]);
            if (result === false) {
              throw new Error(
                `参数 ${i} 验证失败: ${typeof result === "string" ? result : ""}`,
              );
            }
          }
        }
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 缓存装饰器：基于元数据的自动缓存
 */
export function Cache(ttl: number = 60000): MethodDecorator {
  const cache = new Map<string, { value: any; expiry: number }>();

  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = JSON.stringify(args);

      // 检查缓存
      const cached = cache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        console.log(
          `💾 缓存命中: ${target.constructor.name}.${String(propertyKey)}`,
        );
        return cached.value;
      }

      // 执行方法
      const result = await originalMethod.apply(this, args);

      // 存储缓存
      cache.set(cacheKey, {
        value: result,
        expiry: Date.now() + ttl,
      });

      return result;
    };

    return descriptor;
  };
}

/**
 * 度量装饰器：测量执行时间
 */
export function Measure(thresholdMs?: number): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const duration = performance.now() - start;

      // 记录到元数据
      const key = `${target.constructor.name}.${String(propertyKey)}_durations`;
      const durations =
        ReflectedMetadata.getMetadata<number[]>(target, key) || [];
      durations.push(duration);
      ReflectedMetadata.setMetadata(target, key, durations);

      // 检查阈值
      if (thresholdMs && duration > thresholdMs) {
        console.warn(
          `⚠️ ${target.constructor.name}.${String(propertyKey)} 超时: ${duration}ms > ${thresholdMs}ms`,
        );
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * 获取度量统计
 */
export function getMetrics(
  target: object,
  methodName: string,
): {
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
} | null {
  const key = `${(target as any).constructor.name}.${methodName}_durations`;
  const durations = ReflectedMetadata.getMetadata<number[]>(target, key);

  if (!durations || durations.length === 0) {
    return null;
  }

  const sorted = [...durations].sort((a, b) => a - b);

  return {
    count: durations.length,
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: sorted[0],
    maxDuration: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

/**
 * 重试装饰器：基于度量的自动重试
 */
export function RetryOnFailure(
  maxRetries: number = 3,
  backoffMs: number = 1000,
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await originalMethod.apply(this, args);

          if (attempt > 0) {
            console.log(
              `🔄 ${target.constructor.name}.${String(propertyKey)} 重试成功 (尝试 ${attempt}/${maxRetries})`,
            );
          }

          return result;
        } catch (error) {
          lastError = error as Error;
          console.warn(
            `⚠️ ${target.constructor.name}.${String(propertyKey)} 尝试 ${attempt + 1}/${maxRetries + 1} 失败:`,
          );

          if (attempt < maxRetries) {
            const delay = backoffMs * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

/**
 * 自动绑定装饰器：确保方法正确绑定
 */
export function AutoBind(): ClassDecorator {
  return function (target: any) {
    const propertyNames = Object.getOwnPropertyNames(target.prototype);

    for (const name of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(
        target.prototype,
        name,
      );

      if (descriptor && typeof descriptor.value === "function") {
        Object.defineProperty(target.prototype, name, {
          ...descriptor,
          value: descriptor.value.bind(target),
        });
      }
    }

    console.log(`🔗 自动绑定 ${target.name} 的 ${propertyNames.length} 个方法`);
  };
}

/**
 * 创建装饰器组合器
 */
export function createDecoratorComposer(
  ...decorators: ClassDecorator[]
): ClassDecorator {
  return function (target: any) {
    for (const decorator of decorators) {
      decorator(target);
    }
    return target;
  };
}

/**
 * 工厂函数：创建带有标准装饰器的类
 */
export function createDecoratedClass(
  classDefinition: new () => any,
  decorators?: ClassDecorator[],
): new () => any {
  let Class = classDefinition;

  if (decorators && decorators.length > 0) {
    const result = createDecoratorComposer(...decorators)(Class);
    if (result) {
      Class = result as new () => any;
    }
  }

  return Class;
}

/**
 * 导出所有装饰器
 */
export const Decorators = {
  RegisterMetadata,
  LogCalls,
  ValidateParams,
  EnableValidation,
  Cache,
  Measure,
  RetryOnFailure,
  AutoBind,
};
