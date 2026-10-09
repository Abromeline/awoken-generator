#!/usr/bin/env python3
"""Add a sorrowful violin voice to the 4 extended battle tracks.

Imports track data from extended-tracks.py (NOT modified), composes a
violin counter-melody for each track, and outputs the complete updated
track JSON (with "violin" included) to stdout.

Violin character: mournful, legato counter-melody. Weaves around the
lead -- answers its phrases, holds long notes while the lead moves,
moves while the lead holds. Never doubles the lead. Register A3-A5,
mostly lower half. Long sustained notes (2-4 beats), sparse in verses,
more present in bridge/chorus.

Each violin part totals exactly 72 beats, matching lead/bass.
Summaries go to stderr; the seed-ready JSON goes to stdout.
"""

import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "extended_tracks", HERE / "extended-tracks.py"
)
et = importlib.util.module_from_spec(spec)
spec.loader.exec_module(et)

N = et.N  # note helper: N("A4", 2) -> [440.0, 2]
R = et.R  # rest helper:  R(1)      -> [0, 1]


def vbeats(part):
    return sum(b for _, b in part)


# ---------------------------------------------------------------- violin 1
# "Unraveling Assault" -- lament beneath the fury. Sparse long tones
# under the busy riff; sings out in the bridge where the lead drops low.
v1 = [
    # Intro (8): enters in the lead's rests, mournful
    * [N("A4", 3), R(1), N("G4", 4)],
    # Verse (16): holds long tones while the riff rages above
    * [N("E4", 4), N("D4", 4), N("C4", 4), N("B3", 4)],
    # Chorus (16): aching mid-range arc under the high lead
    * [N("G4", 2), N("A4", 2), N("B4", 2), N("C5", 2)],
    * [N("B4", 2), N("A4", 2), N("G4", 2), N("A4", 2)],
    # Bridge (8): the violin's moment -- weeps above the low lead
    * [N("E5", 3), N("D5", 2), N("C5", 3)],
    # Verse variation (16): sparse descent, a fourth above the verse line
    * [N("A4", 4), N("G4", 4), N("F4", 4), N("E4", 4)],
    # Outro (8): final lament resolving down to A
    * [N("D4", 2), N("C4", 2), N("B3", 2), N("A3", 2)],
]

# ---------------------------------------------------------------- violin 2
# "Bastion's Stand" -- yearning. Rises with the heroism but aches.
# Contrary motion against the bridge; converging octaves at verse peaks.
v2 = [
    # Intro (8): gentle figure a 6th-7th below the rising arpeggio
    * [N("C4", 2), N("D4", 2), N("C4", 2), N("B3", 2)],
    # Verse (16): descending lament under the hook
    * [N("C5", 4), N("B4", 4), N("A4", 4), N("G4", 4)],
    # Chorus (16): rises with the anthem, a 4th-6th below the lead
    * [N("C5", 4), N("D5", 4), N("E5", 4), N("D5", 4)],
    # Bridge (8): ascends while the lead descends -- contrary motion,
    # a 5th-7th below throughout, never crossing
    * [N("G4", 2), N("A4", 2), N("B4", 2), N("C5", 2)],
    # Verse variation (16): gentle arch, varied from the verse
    * [N("F4", 4), N("G4", 4), N("A4", 4), N("G4", 4)],
    # Outro (8): resolves down to the tonic
    * [N("D4", 2), N("C4", 2), N("B3", 2), N("A3", 2)],
]

# ---------------------------------------------------------------- violin 3
# "The Hollow March" -- grief. Its natural home. Tritones and 7ths
# for hollow unease; the bridge is a full cry above the whisper.
v3 = [
    # Intro (8): tense 7th resolving upward, lead barely there
    * [N("D4", 4), N("E4", 4)],
    # Verse (16): smooth descending lament over the tolling
    * [N("E4", 4), N("D4", 4), N("C4", 4), N("B3", 4)],
    # Chorus (16): weeping descent, hollow tritones against the tread
    * [N("C5", 2), N("B4", 2), N("A4", 2), N("G4", 2)],
    * [N("F4", 2), N("E4", 2), N("D4", 2), N("E4", 2)],
    # Bridge (8): cries out -- C5-B4-A4 over the uneasy whisper
    * [N("C5", 3), N("B4", 2), N("A4", 3)],
    # Verse variation (16): descent to A, then a breath before the outro
    * [N("D4", 4), N("C4", 4), N("B3", 4), N("A3", 2), R(2)],
    # Outro (8): sinks unresolved on the dominant
    * [N("G4", 4), N("F4", 2), N("E4", 2)],
]

# ---------------------------------------------------------------- violin 4
# "Victory's Dawn" -- bittersweet. Joy with an undertow of loss.
# Descending lines under the sunrise; ends on the 3rd, not the root.
v4 = [
    # Intro (8): ascending undertow beneath the fanfare
    * [N("G4", 2), N("A4", 2), N("B4", 2), N("C5", 2)],
    # Verse (16): the sun rises, the violin mourns -- A-G-F-E descent
    * [N("A4", 4), N("G4", 4), N("F4", 4), N("E4", 4)],
    # Chorus (16): aching high line, a 4th-7th below the triumph
    * [N("E5", 4), N("D5", 4), N("C5", 4), N("B4", 4)],
    # Bridge (8): gentle descending lament over the lift
    * [N("C5", 2), N("B4", 2), N("A4", 2), N("G4", 2)],
    # Verse variation (16): low-mid ascent, no unisons with the runs
    * [N("C4", 4), N("D4", 4), N("E4", 4), N("F4", 4)],
    # Outro (8): resolves to the 3rd -- sweet, not settled
    * [N("F4", 2), N("E4", 2), N("D4", 2), N("E4", 2)],
]

VIOLINS = [v1, v2, v3, v4]


def main():
    tracks = et.TRACKS
    assert len(tracks) == 4, f"expected 4 tracks, got {len(tracks)}"
    assert len(VIOLINS) == 4

    out = []
    for t, violin in zip(tracks, VIOLINS):
        vb = vbeats(violin)
        assert abs(vb - 72) < 1e-9, f'{t["name"]}: violin beats={vb}'
        vn = sum(1 for f, _ in violin if f > 0)
        d = dict(t["data"])
        d["violin"] = violin
        out.append({"name": t["name"], "data": d})
        dur = 72 / d["bpm"] * 60
        print(
            f'{t["name"]}: bpm={d["bpm"]} violin_beats={vb:g} '
            f"violin_notes={vn} duration={dur:.1f}s",
            file=sys.stderr,
        )

    json.dump(out, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
