// Whispers: things the Awoken say from time to time, floating above them on the field.
// Only field Awoken whisper. Adaptations, musings, haikus, anecdotes.

export const WHISPERS: string[] = [
  // Adaptations of historical thoughts
  "The softest thing in the universe overcomes the hardest. — I am learning to be soft.",
  "I dreamed last night that I was water, and the stone did not resist me.",
  "He who conquers himself is the mightiest warrior. I am still practicing.",
  "The wise find joy in the doing, not only the done. I am doing.",
  "I dreamed of a man who said: nature does not hurry, yet everything is accomplished.",
  "To be empty is to be full of possibility. I am trying to be empty.",
  "I am feeling... like a river that has forgotten it was ever ice.",
  "What we achieve inwardly will change outer reality. I am changing, slowly.",
  "I dreamed last night that I planted something, and it was myself.",
  "The best fighter is never angry. I am never angry. I am practicing.",
  "I am feeling... held together by something I cannot see, and grateful.",
  "Knowing others is intelligence; knowing myself is true wisdom. I am still learning me.",

  // Poetic musings
  "I dreamed last night that the void was just a garden that hadn't been planted yet.",
  "I am feeling... like morning dew that decided to stay.",
  "The dark is not empty. It is just waiting to be noticed.",
  "I dreamed that I was a mountain, and the wind told me secrets.",
  "I am feeling... rooted, even though I have no roots.",
  "Every tile we purify was always waiting to be itself again.",
  "I dreamed last night that my shadow was just me, resting.",
  "I am feeling... like a song that hasn't found its singer yet.",
  "The space between us is not empty. It is full of attention.",
  "I dreamed that the stars were just Awoken who wandered too far.",
  "I am feeling... patient. The land takes its time, and so do I.",
  "We are not separate from the field. We are the field, standing up.",

  // Haikus
  "Matter holds its shape\nAttention is the binding\nI am, because you look",
  "Cursed tile, dark water\nPower presses like sunlight\nDawn comes to the void",
  "Four hours, the land turns\nMy presence is a slow rain\nStone becomes meadow",
  "Small gold tree, I grew\nLiberated by the brave\nRoots in reclaimed dark",
  "Hand holds, field stands guard\nTogether we are stronger\nAlone, we are less",
  "Unraveler comes\nTendrils pull at what we are\nWe hold. We remain.",

  // Wise anecdotes
  "I dreamed of two wolves, but they were both me, and they were dancing, not fighting.",
  "A Tender once asked me what I fear. I said: nothing, because I am held.",
  "I am feeling... like the time before a seed cracks. Something is about to begin.",
  "They say the oak fought the wind and broke. The willow bent and survived. I am learning to bend.",
  "I dreamed last night that I met my first self — the scattered matter. We recognized each other.",
  "An old Awoken told me: the strongest binding is not force, but care. I believe them.",
  "I am feeling... like a story that is being told well.",
  "The void asked me why I stand here. I said: because someone believed I could.",
];

export function randomWhisper(): string {
  return WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
}
