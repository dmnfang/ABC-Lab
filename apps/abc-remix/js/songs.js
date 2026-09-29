/* Exact visual screen choreography for ABC Remix. Audio timing remains driven by the supplied MIDI. */
const letter = (display, letterIndex, startBeat, screen, duration = null) => ({ type: "letter", display, letterIndex, startBeat, screen, duration });
const lyric = (display, startBeat, screen, wordIndex = 0, fragment = null, word = display, append = false, duration = null) => ({
  type: "lyric", display, startBeat, screen, wordIndex, fragment: fragment ?? display, word, append, duration
});

const standardEvents = [
  letter("A",0,9,0), letter("B",1,10,0), letter("C",2,11,0), letter("D",3,12,0),
  letter("E",4,13,1), letter("F",5,14,1), letter("G",6,15,1),
  letter("H",7,17,2), letter("I",8,18,2), letter("J",9,19,2), letter("K",10,20,2),
  letter("L",11,21,3), letter("M",12,22,3), letter("N",13,23,3),
  letter("O",14,25,4), letter("P",15,26,4), letter("Q",16,27,4), letter("R",17,28,4),
  letter("S",18,29,5), letter("T",19,30,5), letter("U",20,31,5),
  letter("V",21,33,6), letter("W",22,34,6),
  letter("X",23,37,7), letter("Y",24,38,7), letter("Z",25,39,7),
  lyric("happy",41,8,0,"ha","happy"), lyric("happy",42,8,0,"ppy","happy",true),
  lyric("happy",43,8,1,"ha","happy"), lyric("happy",44,8,1,"ppy","happy",true),
  lyric("I'm",45,9,0,"I'm","I'm"), lyric("happy",46,9,1,"ha","happy"), lyric("happy",47,9,1,"ppy","happy",true),
  lyric("I",49,10,0), lyric("can",50,10,1), lyric("sing",51,10,2), lyric("my",52,10,3),
  lyric("ABCs",53,11,0,"A","ABCs",true), lyric("ABCs",54,11,0,"B","ABCs",true), lyric("ABCs",55,11,0,"Cs","ABCs",true)
];

const lmnoEvents = [
  letter("A",0,9,0), letter("B",1,10,0), letter("C",2,11,0), letter("D",3,12,0),
  letter("E",4,13,1), letter("F",5,14,1), letter("G",6,15,1),
  letter("H",7,17,2), letter("I",8,18,2), letter("J",9,19,2), letter("K",10,20,2),
  letter("L",11,21,3), letter("M",12,21.5,3), letter("N",13,22,3), letter("O",14,22.5,3),
  letter("P",15,23,4),
  letter("Q",16,25,5), letter("R",17,26,5), letter("S",18,27,5),
  letter("T",19,29,6), letter("U",20,30,6), letter("V",21,31,6),
  letter("W",22,33,7), letter("X",23,35,7),
  letter("Y",24,37,8), lyric("and",38,8,1), letter("Z",25,39,8),
  lyric("Now",41,9,0), lyric("I",42,9,1), lyric("know",43,9,2), lyric("my",44,9,3),
  lyric("ABCs",45,10,0,"A","ABCs",true), lyric("ABCs",46,10,0,"B","ABCs",true), lyric("ABCs",47,10,0,"Cs","ABCs",true),
  lyric("Next",49,11,0), lyric("time",50,11,1), lyric("won't",51,11,2), lyric("you",52,11,3),
  lyric("sing",53,12,0), lyric("with",54,12,1), lyric("me",55,12,2)
];

function withSlotDurations(songEvents, screenStarts, durationBeats) {
  return songEvents.map((event, index) => {
    if (event.duration != null) return event;
    const next = songEvents[index + 1];
    const screenEnd = screenStarts[event.screen + 1] ?? durationBeats;
    const nextStart = next && next.screen === event.screen ? next.startBeat : screenEnd;
    return { ...event, duration: Math.max(0, nextStart - event.startBeat) };
  });
}

export const SONGS = {
  standard: {
    name: "Standard", tempo: 100, durationBeats: 57, events: withSlotDurations(standardEvents, [9,13,17,21,25,29,33,37,41,45,49,53], 56),
    chunks: [
      [0,1,2,3], [4,5,6], [7,8,9,10], [11,12,13], [14,15,16,17], [18,19,20],
      [21,22], [23,24,25], [26,27,28,29], [30,31], [32,33,34,35], [36,37]
    ],
    screenStarts: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52],
    rows: [[[0],[1]], [[2],[3]], [[4],[5]], [[6],[7]], [[8],[9]], [[10],[11]]]
  },
  lmno: {
    name: "LMNOP", tempo: 100, durationBeats: 57, events: withSlotDurations(lmnoEvents, [8,12,16,20,22,24,28,32,36,40,44,48,52,56], 56),
    chunks: [
      [0,1,2,3], [4,5,6], [7,8,9,10], [11,12,13,14], [15], [16,17,18], [19,20,21],
      [22,23], [24,25,26], [27,28,29,30], [31], [32,33,34,35], [36,37,38]
    ],
    screenStarts: [9, 13, 17, 21, 23, 25, 29, 33, 37, 41, 45, 49, 53, 57],
    rows: [[[0],[1]], [[2],[3]], [[4],[5]], [[6],[7]], [[8],[9]], [[10],[11]], [[12],[13]]]
  }
};
