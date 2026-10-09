// FF-inspired 8-bit battle tracks. Each is JSON-serializable for DB storage.
// Format: { bpm, lead: [freq, beats], bass: [freq, beats], drums: pattern }
// Frequencies in Hz. Use 0 for rest.

export const BATTLE_TRACKS = [
  {
    name: "Unraveling Assault",
    description: "Fast D-minor battle theme. Driving 150 BPM.",
    data: {
      bpm: 150,
      lead: [
        // D5, F5, A5, G5, F5, E5, D5 — heroic ascending then resolving
        [587.33, 0.5], [698.46, 0.5], [880, 0.5], [783.99, 0.5],
        [698.46, 0.5], [659.25, 0.5], [587.33, 1],
        [0, 0.5],
        // Repeat higher
        [587.33, 0.5], [698.46, 0.5], [880, 0.5], [1046.5, 0.5],
        [987.77, 0.5], [880, 0.5], [783.99, 1],
        [698.46, 0.5], [783.99, 0.5],
      ],
      bass: [
        [146.83, 1], [146.83, 1], [174.61, 1], [196, 1], // D, D, F, G
        [146.83, 1], [146.83, 1], [196, 1], [174.61, 1],
      ],
      drums: "kick-hat-kick-hat-snare-hat-kick-hat",
    },
  },
  {
    name: "Bastion's Stand",
    description: "Heroic F-major anthem. 120 BPM, singable melody.",
    data: {
      bpm: 120,
      lead: [
        // F5, A5, C6 — fanfare opening
        [698.46, 1], [880, 1], [1046.5, 1.5], [880, 0.5],
        [1046.5, 1], [1174.66, 1], [1046.5, 2],
        [0, 1],
        // Second phrase, resolving
        [987.77, 1], [880, 1], [698.46, 1.5], [880, 0.5],
        [698.46, 2], [0, 1],
      ],
      bass: [
        [174.61, 2], [196, 2], [174.61, 2], [146.83, 2], // F, G, F, D
      ],
      drums: "kick-kick-snare-kick",
    },
  },
  {
    name: "The Hollow March",
    description: "Dark and ominous. 90 BPM, for dire waves.",
    data: {
      bpm: 90,
      lead: [
        // Low, creeping: A3, C4, E4, D4
        [220, 1.5], [261.63, 1.5], [329.63, 1.5], [293.66, 1.5],
        [220, 2], [0, 1],
        [196, 1.5], [220, 1.5], [261.63, 2], [0, 1],
      ],
      bass: [
        [110, 3], [98, 3], [110, 3], [130.81, 3], // A, G, A, C — plodding
      ],
      drums: "kick---snare---",
    },
  },
  {
    name: "Victory's Dawn",
    description: "Uplifting fanfare. 140 BPM.",
    data: {
      bpm: 140,
      lead: [
        // C5, E5, G5, C6 — bright major arpeggio
        [523.25, 0.5], [659.25, 0.5], [783.99, 0.5], [1046.5, 1],
        [783.99, 0.5], [1046.5, 1.5],
        [987.77, 0.5], [880, 0.5], [783.99, 1], [659.25, 1],
      ],
      bass: [
        [130.81, 1], [164.81, 1], [196, 1], [130.81, 1], // C, E, G, C
      ],
      drums: "kick-hat-snare-hat-kick-hat-snare-hat",
    },
  },
];
