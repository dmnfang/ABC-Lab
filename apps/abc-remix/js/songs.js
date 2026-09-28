/* Exact visual screen choreography for ABC Remix. Audio timing remains driven by the supplied MIDI. */
const letter = (display, letterIndex, startBeat, screen, duration = null) => ({ type: "letter", display, letterIndex, startBeat, screen, duration });
const lyric = (display, startBeat, screen, wordIndex = 0, fragment = null, word = display, append = false, duration = null) => ({
  type: "lyric", display, startBeat, screen, wordIndex, fragment: fragment ?? display, word, append, duration
});

const standardEvents = [
  letter("A",0,12,0), letter("B",1,13,0), letter("C",2,14,0), letter("D",3,15,0),
  letter("E",4,16,1), letter("F",5,17,1), letter("G",6,18,1),
  letter("H",7,20,2), letter("I",8,21,2), letter("J",9,22,2), letter("K",10,23,2),
  letter("L",11,24,3), letter("M",12,25,3), letter("N",13,26,3),
  letter("O",14,28,4), letter("P",15,29,4), letter("Q",16,30,4), letter("R",17,31,4),
  letter("S",18,32,5), letter("T",19,33,5), letter("U",20,34,5),
  letter("V",21,36,6), letter("W",22,37,6),
  letter("X",23,40,7), letter("Y",24,41,7), letter("Z",25,42,7),
  lyric("happy",44,8,0,"ha","happy"), lyric("happy",45,8,0,"ppy","happy",true),
  lyric("happy",46,8,1,"ha","happy"), lyric("happy",47,8,1,"ppy","happy",true),
  lyric("I'm",48,9,0,"I'm","I'm"), lyric("happy",49,9,1,"ha","happy"), lyric("happy",50,9,1,"ppy","happy",true),
  lyric("I",52,10,0), lyric("can",53,10,1), lyric("sing",54,10,2), lyric("my",55,10,3),
  lyric("ABCs",56,11,0,"A","ABCs",true), lyric("ABCs",57,11,0,"B","ABCs",true), lyric("ABCs",58,11,0,"Cs","ABCs",true)
];

const lmnoEvents = [
  letter("A",0,12,0), letter("B",1,13,0), letter("C",2,14,0), letter("D",3,15,0),
  letter("E",4,16,1), letter("F",5,17,1), letter("G",6,18,1),
  letter("H",7,20,2), letter("I",8,21,2), letter("J",9,22,2), letter("K",10,23,2),
  letter("L",11,24,3), letter("M",12,24.5,3), letter("N",13,25,3), letter("O",14,25.5,3),
  letter("P",15,26,4),
  letter("Q",16,28,5), letter("R",17,29,5), letter("S",18,30,5),
  letter("T",19,32,6), letter("U",20,33,6), letter("V",21,34,6),
  letter("W",22,36,7), letter("X",23,38,7),
  letter("Y",24,40,8), lyric("and",41,8,1), letter("Z",25,42,8),
  lyric("Now",44,9,0), lyric("I",45,9,1), lyric("know",46,9,2), lyric("my",47,9,3),
  lyric("ABCs",48,10,0,"A","ABCs",true), lyric("ABCs",49,10,0,"B","ABCs",true), lyric("ABCs",50,10,0,"Cs","ABCs",true),
  lyric("Next",52,11,0), lyric("time",53,11,1), lyric("won't",54,11,2), lyric("you",55,11,3),
  lyric("sing",56,12,0), lyric("with",57,12,1), lyric("me",58,12,2)
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
    name: "Standard", tempo: 100, durationBeats: 60, events: withSlotDurations(standardEvents, [8,12,16,20,24,28,32,36,40,44,48,52], 56),
    chunks: [
      [0,1,2,3], [4,5,6], [7,8,9,10], [11,12,13], [14,15,16,17], [18,19,20],
      [21,22], [23,24,25], [26,27,28,29], [30,31], [32,33,34,35], [36,37]
    ],
    screenStarts: [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56],
    rows: [[[0],[1]], [[2],[3]], [[4],[5]], [[6],[7]], [[8],[9]], [[10],[11]]]
  },
  lmno: {
    name: "LMNOP", tempo: 100, durationBeats: 60, events: withSlotDurations(lmnoEvents, [8,12,16,20,22,24,28,32,36,40,44,48,52,56], 56),
    chunks: [
      [0,1,2,3], [4,5,6], [7,8,9,10], [11,12,13,14], [15], [16,17,18], [19,20,21],
      [22,23], [24,25,26], [27,28,29,30], [31], [32,33,34,35], [36,37,38]
    ],
    screenStarts: [12, 16, 20, 24, 26, 28, 32, 36, 40, 44, 48, 52, 56, 60],
    rows: [[[0],[1]], [[2],[3]], [[4],[5]], [[6],[7]], [[8],[9]], [[10],[11]], [[12],[13]]]
  }
};
