#!/usr/bin/env python3
"""Extended 8-bit chiptune battle tracks for the Awoken Generator.

Each track: ~72 beats with Intro / Verse / Chorus / Bridge /
Verse-variation / Outro structure, 50-70 lead notes.

Outputs JSON (stdout) in the shape the game seeds into its DB:
  [{ "name": str, "data": { "bpm": n, "lead": [[hz, beats]...],
                            "bass": [[hz, beats]...], "drums": "a-b-c" } }, ...]
Summaries go to stderr.
"""

import json
import sys

FREQ = {
    "A2": 110.0, "B2": 123.47, "C3": 130.81, "D3": 146.83,
    "E3": 164.81, "F3": 174.61, "G3": 196.0, "A3": 220.0,
    "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63,
    "F4": 349.23, "G4": 392.0, "A4": 440.0, "B4": 493.88,
    "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46,
    "G5": 783.99, "A5": 880.0, "B5": 987.77, "C6": 1046.5,
    "D6": 1174.66, "E6": 1318.51,
}


def N(name, beats):
    """A note: [frequency_hz, beats]."""
    return [FREQ[name], beats]


def R(beats):
    """A rest: [0, beats]."""
    return [0, beats]


def beats(part):
    return sum(b for _, b in part)


def build(name, bpm, lead, bass, drums):
    lb, bb = beats(lead), beats(bass)
    assert abs(lb - 72) < 1e-9, f"{name}: lead beats={lb}"
    assert abs(bb - 72) < 1e-9, f"{name}: bass beats={bb}"
    lead_notes = sum(1 for f, _ in lead if f > 0)
    assert 50 <= lead_notes <= 70, f"{name}: lead notes={lead_notes}"
    return {
        "name": name,
        "data": {"bpm": bpm, "lead": lead, "bass": bass, "drums": drums},
    }


# ---------------------------------------------------------------- track 1
# "Unraveling Assault" — 150 BPM, aggressive A-minor driver.
t1_lead = [
    # Intro (8): sparse, building
    * [N("E5", 1), R(1), N("G5", 1.5), R(0.5), N("A5", 2), N("G5", 1), R(1)],
    # Verse (16): main riff
    * [N("A5", 0.5), N("G5", 0.5), N("E5", 1), N("D5", 1), N("E5", 1)],
    * [N("C6", 1), N("B5", 0.5), N("A5", 0.5), N("G5", 1), N("E5", 1)],
    * [N("A5", 1), N("G5", 1), N("E5", 1), N("D5", 1)],
    * [N("D5", 1.5), N("C5", 0.5), N("B4", 1), N("A4", 1)],
    # Chorus (16): higher register, higher energy
    * [N("E6", 1), N("D6", 0.5), N("C6", 0.5), N("B5", 1), N("A5", 1)],
    * [N("G5", 1), N("A5", 1), N("B5", 1), N("C6", 1)],
    * [N("D6", 1), N("E6", 1), N("D6", 0.5), N("C6", 0.5), N("B5", 1)],
    * [N("A5", 2), N("G5", 1), N("E5", 1)],
    # Bridge (8): breakdown, Phrygian bite on F
    * [N("A4", 1), R(1), N("G4", 1), N("E4", 1)],
    * [N("F4", 1.5), N("E4", 0.5), N("D4", 1), N("E4", 1)],
    # Verse variation (16): ornamented riff
    * [N("A5", 0.5), N("B5", 0.5), N("G5", 0.5), N("E5", 1), N("D5", 1.5)],
    * [N("C6", 0.5), N("B5", 0.5), N("A5", 1), N("G5", 1), N("E5", 1)],
    * [N("A5", 1), N("G5", 0.5), N("E5", 0.5), N("D5", 1), N("C5", 1)],
    * [N("D5", 1), N("C5", 1), N("B4", 1), N("A4", 1)],
    # Outro (8): resolve down to A
    * [N("A5", 2), N("G5", 1), N("E5", 1), N("D5", 2), N("A4", 2)],
]
t1_bass = [
    * [N("A2", 1), R(1), N("A2", 1), R(1), N("A2", 2), N("A2", 1), R(1)],
    * [N("A2", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("E3", 1)] * 4,
    * [N("A2", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("D3", 2), N("D3", 2), N("E3", 2), N("E3", 2)],
    * [N("A2", 1), N("A2", 1), N("A3", 1), N("A2", 1)],
    * [N("F3", 1), N("F3", 1), N("A3", 1), N("F3", 1)],
    * [N("G3", 1)] * 4,
    * [N("E3", 1), N("E3", 1), N("G3", 1), N("E3", 1)],
    * [N("A2", 2), N("G3", 1), N("F3", 1), N("E3", 2), N("A2", 2)],
]

# ---------------------------------------------------------------- track 2
# "Bastion's Stand" — 120 BPM, heroic anthem.
t2_lead = [
    # Intro (8): rising arpeggio, sparse
    * [N("A4", 2), N("C5", 2), N("E5", 2), N("A5", 2)],
    # Verse (16): the hook
    * [N("E5", 1.5), N("D5", 0.5), N("C5", 1), N("D5", 1)],
    * [N("E5", 2), N("G5", 1), N("E5", 1)],
    * [N("A5", 1.5), N("G5", 0.5), N("E5", 1), N("D5", 1)],
    * [N("C5", 1), N("D5", 1), N("B4", 1), R(1)],
    # Chorus (16): anthemic peak
    * [N("A5", 1), N("C6", 1), N("B5", 1), N("A5", 1)],
    * [N("G5", 1.5), N("E5", 0.5), N("G5", 2)],
    * [N("A5", 1), N("C6", 1), N("D6", 1), N("C6", 1)],
    * [N("B5", 1.5), N("G5", 0.5), N("A5", 2)],
    # Bridge (8): half-time breather
    * [N("E5", 2), N("D5", 2)],
    * [N("C5", 2), N("B4", 1), N("A4", 1)],
    # Verse variation (16): ornamented hook
    * [N("E5", 1), N("F5", 0.5), N("E5", 0.5), N("D5", 1), N("C5", 1)],
    * [N("D5", 0.5), N("E5", 0.5), N("G5", 1), N("A5", 1), N("G5", 1)],
    * [N("A5", 1), N("G5", 0.5), N("A5", 0.5), N("C6", 1), N("B5", 1)],
    * [N("A5", 1.5), N("G5", 0.5), N("E5", 2)],
    # Outro (8): resolve
    * [N("A5", 2), N("G5", 1), N("E5", 1)],
    * [N("D5", 1), N("C5", 1), N("B4", 1), N("A4", 1)],
]
t2_bass = [
    * [N("A2", 2), N("A2", 2), N("E3", 2), N("E3", 2)],
    * [N("A2", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("A2", 1)] * 4,
    * [N("D3", 2), N("D3", 2), N("E3", 2), N("E3", 2)],
    * [N("A2", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("F3", 2), N("E3", 1), N("D3", 1), N("C3", 1), N("B2", 1), N("A2", 2)],
]

# ---------------------------------------------------------------- track 3
# "The Hollow March" — 90 BPM, dark and ominous.
t3_lead = [
    # Intro (8): hollow, barely there
    * [N("E4", 2), R(1), N("G3", 1), N("B3", 2), R(2)],
    # Verse (16): slow tolling descent
    * [N("A3", 1.5), N("B3", 0.5), N("C4", 2)],
    * [N("B3", 1), N("A3", 1), N("G3", 1), N("A3", 1)],
    * [N("E4", 2), N("F4", 2)],
    * [N("E4", 2), N("D4", 1), R(1)],
    # Chorus (16): heavy tread
    * [N("A4", 1), N("A4", 1), N("G4", 1), N("F4", 1)],
    * [N("E4", 2), N("D4", 1), N("C4", 1)],
    * [N("B3", 1), N("C4", 1), N("D4", 1), N("E4", 1)],
    * [N("F4", 1.5), N("E4", 1.5), N("D4", 1)],
    # Bridge (8): uneasy whisper
    * [N("A3", 1), R(0.5), N("A3", 0.5), R(1), N("G3", 1)],
    * [N("E4", 2), N("B3", 2)],
    # Verse variation (16): tolling with dread ornaments
    * [N("A3", 1.5), N("B3", 0.5), N("C4", 2)],
    * [N("B3", 1), N("A3", 1), N("G3", 1), N("A3", 1)],
    * [N("E4", 1), N("F4", 1), N("E4", 1), N("D4", 1)],
    * [N("C4", 1), N("B3", 1), N("A3", 2)],
    # Outro (8): sinks into the dark
    * [N("E4", 1), N("F4", 1), N("E4", 2)],
    * [N("D4", 1), N("C4", 1), N("B3", 1), N("A3", 1)],
]
t3_bass = [
    * [N("A2", 4), N("A2", 4)],
    * [N("A2", 2), N("A2", 2)],
    * [N("E3", 2), N("E3", 2)],
    * [N("F3", 2), N("F3", 2)],
    * [N("E3", 2), N("E3", 2)],
    * [N("D3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("B2", 1)] * 4,
    * [N("E3", 1)] * 4,
    * [N("A2", 4), N("E3", 4)],
    * [N("A2", 2), N("A2", 2)],
    * [N("E3", 2), N("E3", 2)],
    * [N("F3", 2), N("F3", 2)],
    * [N("E3", 2), N("E3", 2)],
    * [N("F3", 2), N("E3", 2), N("D3", 2), N("A2", 2)],
]

# ---------------------------------------------------------------- track 4
# "Victory's Dawn" — 140 BPM, triumphant C-major sunrise.
t4_lead = [
    # Intro (8): fanfare rising
    * [N("C5", 1), N("E5", 1), N("G5", 1), N("C6", 2), N("G5", 1), N("E5", 1), R(1)],
    # Verse (16): sunrise theme
    * [N("E5", 1), N("G5", 1), N("A5", 1), N("G5", 1)],
    * [N("E5", 1.5), N("D5", 0.5), N("C5", 2)],
    * [N("D5", 1), N("E5", 1), N("F5", 1), N("E5", 1)],
    * [N("D5", 1.5), N("C5", 1.5), R(1)],
    # Chorus (16): triumphant peak
    * [N("C6", 1), N("B5", 0.5), N("A5", 0.5), N("G5", 1), N("A5", 1)],
    * [N("C6", 2), N("G5", 2)],
    * [N("A5", 1), N("G5", 1), N("F5", 1), N("E5", 1)],
    * [N("D5", 1), N("E5", 1), N("C5", 2)],
    # Bridge (8): gentle lift
    * [N("E5", 2), N("D5", 2)],
    * [N("C5", 1.5), N("B4", 0.5), N("C5", 2)],
    # Verse variation (16): theme with sparkling runs
    * [N("E5", 0.5), N("G5", 0.5), N("A5", 1), N("G5", 0.5), N("E5", 0.5), N("D5", 1)],
    * [N("E5", 1), N("F5", 0.5), N("E5", 0.5), N("D5", 1), N("C5", 1)],
    * [N("D5", 1), N("E5", 0.5), N("G5", 0.5), N("A5", 1), N("G5", 1)],
    * [N("E5", 1.5), N("D5", 0.5), N("C5", 2)],
    # Outro (8): resolve home to C
    * [N("E5", 1), N("D5", 1), N("C5", 2)],
    * [N("G4", 1), N("C5", 3)],
]
t4_bass = [
    * [N("C3", 2), N("G3", 2), N("C3", 2), N("C3", 2)],
    * [N("C3", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("A2", 2), N("F3", 2), N("G3", 2), N("G3", 2)],
    * [N("C3", 1)] * 4,
    * [N("F3", 1)] * 4,
    * [N("G3", 1)] * 4,
    * [N("C3", 1)] * 4,
    * [N("F3", 1), N("G3", 1), N("C3", 2), N("C3", 4)],
]

TRACKS = [
    build("Unraveling Assault", 150, t1_lead, t1_bass,
          "kick-hat-kick-hat-snare-hat-kick-hat"),
    build("Bastion's Stand", 120, t2_lead, t2_bass,
          "kick-kick-snare-hat-kick-snare-kick-hat"),
    build("The Hollow March", 90, t3_lead, t3_bass,
          "kick-rest-rest-rest-snare-rest-rest-rest"),
    build("Victory's Dawn", 140, t4_lead, t4_bass,
          "kick-hat-snare-hat-kick-hat-snare-hat"),
]


def main():
    for t in TRACKS:
        d = t["data"]
        total = beats(d["lead"])
        lead_n = sum(1 for f, _ in d["lead"] if f > 0)
        bass_n = sum(1 for f, _ in d["bass"] if f > 0)
        dur = total / d["bpm"] * 60
        print(
            f'{t["name"]}: bpm={d["bpm"]} beats={total:g} '
            f"lead_notes={lead_n} bass_notes={bass_n} "
            f"duration={dur:.1f}s drums={d['drums']}",
            file=sys.stderr,
        )
    json.dump(TRACKS, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
