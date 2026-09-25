// =========================================================
// セーブ／ロード
//  ・手動3スロット（slot1〜slot3）＋オート1枠（auto）
//  ・ロード後の行き先はセーブ内のモードで決まる（TOWN→街、RAISING→ファーム）
// =========================================================
import { migrate } from './migrations.js';
import { validateState, MODES } from './state.js';

const FORMAT = 'monster-master-save';
let storage = null;
let cfg = null;

export function initSave(storageAdapter, config) {
  storage = storageAdapter;
  cfg = config;
}

export function manualSlotIds() {
  return Array.from({ length: cfg.saveSlots.manual }, (_, i) => `slot${i + 1}`);
}
export function allSlotIds() { return [...manualSlotIds(), 'auto']; }
export function slotLabel(id) { return id === 'auto' ? 'オートセーブ' : `セーブ ${id.replace('slot', '')}`; }
export function storageInfo() { return { kind: storage.kind, persistent: storage.persistent }; }

function assertSlot(id) {
  if (!allSlotIds().includes(id)) throw new Error(`不明なセーブ枠：${id}`);
}

export function summarize(s) {
  return {
    playerName: s.player.name,
    mode: s.mode,
    place: s.mode === MODES.RAISING ? 'ファーム' : '街',
    activeName: s.active?.nickname ?? null,
    calendar: { ...s.player.calendar },
    gold: s.player.gold,
    playTimeSec: Math.floor(s.playTimeSec),
    raisedCount: s.records.raisedCount,
  };
}

async function write(slotId, state) {
  assertSlot(slotId);
  const problem = validateState(state);
  if (problem) throw new Error(`保存できません：${problem}`);
  const record = {
    format: FORMAT,
    version: cfg.saveVersion,
    appVersion: cfg.version,
    savedAt: new Date().toISOString(),
    summary: summarize(state),
    data: structuredClone(state),
  };
  await storage.set(`save.${slotId}`, JSON.stringify(record));
  return record;
}

// プレイヤーが選ぶのは手動スロットだけ
export async function saveManual(slotId, state) {
  if (!manualSlotIds().includes(slotId)) throw new Error('手動セーブは セーブ1〜3 にだけ保存できます');
  return write(slotId, state);
}

export async function autosave(state) {
  return write('auto', state);
}

async function readRecord(slotId) {
  assertSlot(slotId);
  const raw = await storage.get(`save.${slotId}`);
  if (raw == null) return null;
  const record = JSON.parse(raw);
  if (record.format !== FORMAT) throw new Error('モンスターマスターのセーブデータではありません');
  return migrate(record, cfg.saveVersion);
}

/** 戻り値：{ state, resumeAt: 'town' | 'farm' }。空なら null */
export async function load(slotId) {
  const record = await readRecord(slotId);
  if (!record) return null;
  const problem = validateState(record.data);
  if (problem) throw new Error(`セーブデータが壊れています：${problem}`);
  return { state: record.data, resumeAt: record.data.mode === MODES.RAISING ? 'farm' : 'town' };
}

export async function listSlots() {
  const out = [];
  for (const slotId of allSlotIds()) {
    try {
      const record = await readRecord(slotId);
      out.push({ slotId, label: slotLabel(slotId), empty: !record, summary: record?.summary ?? null, savedAt: record?.savedAt ?? null });
    } catch (err) {
      out.push({ slotId, label: slotLabel(slotId), empty: false, error: err.message });
    }
  }
  return out;
}

export async function hasAnySave() {
  return (await listSlots()).some((s) => !s.empty);
}

export async function deleteSlot(slotId) {
  assertSlot(slotId);
  await storage.remove(`save.${slotId}`);
}
