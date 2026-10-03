# Mystic Monsters design handoff — 2026-10-03

This pack contains 75 unique images received in the design-asset batch. Exact duplicate retransmissions were removed from the pack; original uploaded files are unchanged.

## Important classification
- 01 Treasure chests: formal assets. 4 chest types, each = 1 base + 4 animation frames.
- 02 NPC message UI: design/UI reference. Rebuild as live UI; do not bake reference text/characters/background into reusable UI.
- 03 First town guide / Fina: REFERENCE ONLY. The Fina design and town shown here are not the current formal ones. Use only for composition, scale, and dialogue-window direction.
- 04 + 06 Encounter / tournament / Chapter UI: design references for implementation. Use current formal monsters/NPCs/names/data from the game; do not treat placeholder subjects as canon.
- 05 Fusion effect: formal 10-frame sequence. Integrate into the laboratory/fusion flow only after confirming existing flow/hook points; preserve game logic.
- 07 Wild sacred-beast encounter: formal 8-frame cinematic sequence. Treat as a special encounter presentation, not normal wild-monster UI.
- 08 Item shop NPC: formal NPC visual asset. Name is not assigned by this pack; do not invent one unless current game spec already has one.
- 09 Item shop background: formal shop interior background.
- 10 Tournament reward/unlock effects: formal 4-effect set; checkerboard may be baked into JPEG, so preserve originals and create derived transparent/optimized files only if quality can be verified.
- 11 Tournament rank emblems: formal 6-rank sheet; slice into six derived assets only if needed, preserving the original sheet.

## Do not do
- Do not replace current formal Fina, town background, monsters, or NPCs with placeholder subjects shown inside concept composites.
- Do not overwrite protected battle logic or Phase 6 calculations/flow.
- Do not delete or destructively edit originals. Derived optimized assets go in separate paths.
- Do not implement unapproved story/prologue C onward from these files. Prologue is currently completed only through B.
