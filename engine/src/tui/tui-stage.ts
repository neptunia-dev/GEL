import type { TuiCharacterSlot, TuiSide, TuiStageSnapshot } from "./tui-types";

export type { TuiSide } from "./tui-types";

/** 创建舞台角色时使用的输入数据。 */
export interface TuiCharacterSlotInput {
  characterId: string;
  displayName: string;
  role?: string;
  expression?: string;
}

/**
 * 管理当前画面实际登场的角色。
 *
 * SceneCast 只描述场景可能使用的角色；本对象才描述当前画面中实际
 * 可见的角色。登场、下场、换位和聚焦都必须由调用方显式触发。
 */
export class TuiStage {
  private slots: TuiStageSnapshot = { left: null, right: null };

  /** 让角色出现在指定位置；目标位置已有其他角色时直接报错。 */
  public show(input: TuiCharacterSlotInput, side: TuiSide): void {
    const current = this.slots[side];
    if (current !== null && current.characterId !== input.characterId) {
      throw new Error(`TUI ${side} position is occupied by '${current.characterId}'`);
    }

    const otherSide = side === "left" ? "right" : "left";
    if (this.slots[otherSide]?.characterId === input.characterId) {
      throw new Error(`Character '${input.characterId}' is already visible on ${otherSide}`);
    }

    this.slots[side] = {
      ...input,
      side,
      focused: false,
    };
  }

  /** 让指定角色离开舞台；角色不存在时返回 false。 */
  public hide(characterId: string): boolean {
    for (const side of ["left", "right"] as const) {
      if (this.slots[side]?.characterId === characterId) {
        this.slots[side] = null;
        return true;
      }
    }
    return false;
  }

  /** 将已经登场的角色移动到另一侧。 */
  public move(characterId: string, side: TuiSide): void {
    const currentSide = this.findSide(characterId);
    if (currentSide === null) {
      throw new Error(`Character '${characterId}' is not visible`);
    }
    if (currentSide === side) {
      return;
    }
    if (this.slots[side] !== null) {
      throw new Error(`TUI ${side} position is occupied`);
    }

    const current = this.slots[currentSide];
    this.slots[currentSide] = null;
    this.slots[side] = current === null ? null : { ...current, side };
  }

  /** 设置当前聚焦角色；传入 null 表示取消聚焦。 */
  public focus(characterId: string | null): void {
    if (characterId !== null && this.findSide(characterId) === null) {
      throw new Error(`Cannot focus invisible character '${characterId}'`);
    }
    for (const side of ["left", "right"] as const) {
      const slot = this.slots[side];
      if (slot !== null) {
        slot.focused = slot.characterId === characterId;
      }
    }
  }

  /** 取得指定位置的副本。 */
  public get(side: TuiSide): TuiCharacterSlot | null {
    const slot = this.slots[side];
    return slot === null ? null : { ...slot };
  }

  /** 按角色 ID 取得当前登场角色的副本。 */
  public getByCharacterId(characterId: string): TuiCharacterSlot | null {
    const side = this.findSide(characterId);
    return side === null ? null : this.get(side);
  }

  /** 返回舞台快照，供回退和重绘使用。 */
  public snapshot(): TuiStageSnapshot {
    return {
      left: this.slots.left === null ? null : { ...this.slots.left },
      right: this.slots.right === null ? null : { ...this.slots.right },
    };
  }

  /** 恢复此前保存的舞台快照。 */
  public restore(snapshot: TuiStageSnapshot): void {
    this.slots = {
      left: snapshot.left === null ? null : { ...snapshot.left },
      right: snapshot.right === null ? null : { ...snapshot.right },
    };
  }

  private findSide(characterId: string): TuiSide | null {
    if (this.slots.left?.characterId === characterId) {
      return "left";
    }
    if (this.slots.right?.characterId === characterId) {
      return "right";
    }
    return null;
  }
}
