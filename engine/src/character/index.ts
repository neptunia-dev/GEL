/** 角色领域模块的公共出口。 */
export {
  Character,
  CHARACTER_ID_PATTERN,
  requireCharacterId,
  type CharacterAssetRef,
  type CharacterDefinition,
  type CharacterId,
  type CharacterPortraitDefinition,
  type CharacterPortraitId,
  type CharacterState,
} from "./character";
export {
  CharacterRegistry,
  type CharacterStateSnapshot,
} from "./character-registry";
