/**
 * What passengers say (§11: one short, warm, funny line at a time). Lines are picked at random from the
 * situation's list; the Feedback system decides whether anyone speaks at all (rarely, never two at once,
 * the same kind of remark at most every so often). Critical lines only start once the soft cues do.
 * Pure data: add lines or situations freely.
 */
export type ChatterSituation =
  | 'boardRundown' | 'boardRepaired' | 'boardCosy' | 'boardLuxury' | 'boardFamous' | 'boardGoodBuzz' | 'boardBadBuzz'
  | 'fastService' | 'slowService' | 'waitingLong' | 'deskWaiting'
  | 'reviewGood' | 'reviewBad'
  | 'missedTrain' | 'noBed' | 'noWashroom' | 'emptyWashroom' | 'rush';

export const CHATTER: Record<ChatterSituation, readonly string[]> = {
  // Checking in: the state of the carriage speaks for itself.
  boardRundown: ['Is that a hole in the floor?', 'Rustic. Very… rustic.', "I've slept in cosier sheds.", 'Does the leak cost extra?', 'Mind the cobwebs, dear.'],
  boardRepaired: ['Ooh, fresh paint!', 'Better than I heard!', 'Smells of new varnish.'],
  boardCosy: ['Now this is cosy.', 'Oh, what lovely carpets!', 'I could live in here.'],
  boardLuxury: ['Now THIS is travelling.', 'Is that real gold?', "Pinch me, I'm in first class."],
  // Word gets around: the league table and the service lately.
  boardFamous: ['Top of the league, they say!', "Everyone's talking about this train.", 'I booked months ahead!'],
  boardGoodBuzz: ['Heard the service is spot on.', 'My friend raved about you!', 'They say you bring tea in seconds.'],
  boardBadBuzz: ['I hear the service is… leisurely.', 'My cousin waited an hour for tea.', 'Bring a book, they said.'],
  // Requests.
  fastService: ['That was quick!', "You're a marvel.", 'Five stars, darling.', "Blink and it's here!"],
  slowService: ['Took your time…', 'My tea went cold waiting for tea.', 'I aged a year.', 'Finally!'],
  waitingLong: ['Hello? Anyone?', 'Still waiting…', 'Is the staff on holiday?', "I'll just… sit here, then."],
  deskWaiting: ['Ding ding! Anyone?', 'Is reception closed?', 'Hellooo?'],
  // Getting off: a one-line review.
  reviewGood: ['Best sleep in years!', 'Lovely ride, thank you!', 'Coming back next week!', 'Ten out of ten.'],
  reviewBad: ['The service was a bit slow.', 'Could be tidier.', 'The draught kept me up.'],
  // Platform and train status.
  missedTrain: ['Wait! WAIT!', "I'll take the bus, then.", 'Was that my train?!', 'Rude!'],
  noBed: ['No beds? On a sleeper train?', 'Full again!', 'Next time, then.'],
  noWashroom: ['Where IS the loo on this train?', 'Is there a washroom? Anywhere?', 'Not one loo? Really?'],
  emptyWashroom: ['No towels?!', 'Out of loo roll. Of course.', 'Who forgot the towels?'],
  rush: ['Look at them go!', 'Busy bee!', 'Faster than the train!'],
};
