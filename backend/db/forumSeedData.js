// Deterministic demo content for Farmer Circle (see forumSeed.js).
// ago = minutes before "now" that the post was created; score = number of +1 votes.

// [key, phone, display name, village, region code, role]. Phones are fictional; sign in with the demo PIN.
export const DEMO_USERS = [
  ['10000001', '9100000001', 'Ravi K.', 'Patna outskirts', 'IN-BR', 'member'],
  ['10000002', '9100000002', 'Asha P.', 'Rampur', 'IN-UP-01', 'member'],
  ['10000003', '9100000003', 'Minh Tran', 'Long Xuyen', 'VN-AG', 'member'],
  ['10000004', '9100000004', 'Rahim U.', 'Boalia', 'BD-RAJ', 'member'],
  ['10000005', '9100000005', 'Meena S.', 'Danapur', 'IN-BR', 'moderator'],
];
// Regions the demo needs that a fresh database may lack. Existing codes are left untouched.
// [code, country, name, latitude, longitude] - centre points match migration 008.
export const DEMO_REGIONS = [
  ['IN-BR', 'IN', 'Bihar', 25.5941, 85.1376], ['IN-UP-01', 'IN', 'Rampur, Uttar Pradesh', 28.8, 79.03],
  ['VN-AG', 'VN', 'An Giang', 10.3864, 105.4352], ['BD-RAJ', 'BD', 'Rajshahi', 24.3745, 88.6042],
];
export const VOTER_COUNT = 34;

// ago = minutes before "now" that the post was created.
export const POSTS = [
  { id: 'seed_post_crop_01', author: '10000001', community: 'crop-talk', type: 'question', ago: 240, score: 24, tags: ['rice', 'disease'], solved: 1,
    title: 'Brown spots appeared after three rainy days',
    body: 'Small brown spots appeared on older rice leaves after three days of rain. The lower field stayed wet. Has anyone seen this before?',
    replies: [
      ['10000005', 'Check whether the spots have a grey center. Also inspect the underside before applying anything.', 8],
      ['10000002', 'I had similar marks after water stayed in the field. Drain excess water and monitor new leaves.', 5],
      ['10000004', 'Post a clear close photo if the spots spread.', 2],
    ] },
  { id: 'seed_post_machine_01', author: '10000002', community: 'machinery', type: 'question', ago: 190, score: 17, tags: ['pump', 'repair'],
    title: 'Water pump started making a rattling noise',
    body: 'The pump still moves water but began rattling this morning. The inlet pipe looks clear. What should I inspect before running it again?',
    replies: [
      ['10000001', 'Stop it first. Check for loose mounting bolts and debris near the impeller.', 6],
      ['10000005', 'Do not run it dry. Check whether air is entering the suction line.', 4],
    ] },
  { id: 'seed_post_market_01', author: '10000001', community: 'market-talk', type: 'local_report', ago: 120, score: 12, tags: ['rice', 'price-report'],
    title: 'Rice offered at ₹34/kg in Patna this morning',
    body: 'One buyer offered ₹34/kg for clean, bagged rice this morning. This is my personal report, not an official market quote. What offers are others seeing?',
    replies: [
      ['10000005', 'A buyer near my area offered ₹33/kg, but transport was included.', 4],
      ['10000001', 'Please include moisture requirements when comparing offers.', 3],
    ] },
  { id: 'seed_post_livestock_01', author: '10000004', community: 'livestock', type: 'question', ago: 600, score: 9, tags: ['goat', 'feed'],
    title: 'Goat stopped eating since this morning',
    body: 'One goat is quiet and has not eaten since morning. Clean water is available and the other goats look normal. What signs should I check before calling the vet?',
    replies: [
      ['10000003', 'Check temperature, stool, breathing, and whether the abdomen looks swollen. Call a vet urgently if breathing is difficult.', 5],
    ] },
  { id: 'seed_post_life_01', author: '10000003', community: 'farm-life', type: 'discussion', ago: 1500, score: 8, tags: ['transport', 'help-needed'],
    title: 'Looking to share transport to the district market',
    body: 'I expect about 25 bags next Friday. Is anyone nearby interested in sharing one truck to reduce the transport cost?',
    replies: [['10000004', 'Add your preferred departure time and approximate distance.', 2]] },
  { id: 'seed_post_crop_02', author: '10000003', community: 'crop-talk', type: 'discussion', ago: 300, score: 15, tags: ['rice', 'fertilizer'],
    title: 'How long do you wait after heavy rain before fertilizing?',
    body: "The field is still soft after yesterday's rain. I usually wait until standing water clears. What do other rice growers do?",
    replies: [
      ['10000001', 'I wait two or three dry days and until the water level drops below the soil.', 3],
      ['10000002', 'Split the dose in two so a sudden rain does not wash it all away.', 2],
    ] },
  { id: 'seed_post_machine_02', author: '10000004', community: 'machinery', type: 'discussion', ago: 2000, score: 13, tags: ['pump', 'buying-advice'],
    title: 'What should I check when buying a used irrigation pump?',
    body: 'I am comparing two used pumps. Besides leaks and startup noise, what checks have saved you from a bad purchase?',
    replies: [['10000002', 'Ask to see it run for ten minutes. Check that the shaft turns freely by hand first.', 4]] },
  { id: 'seed_post_market_02', author: '10000002', community: 'market-talk', type: 'discussion', ago: 900, score: 10, tags: ['wheat', 'buyer-demand'],
    title: 'Do buyers deduct more for wheat moisture this week?',
    body: 'Two buyers gave different moisture deductions. Please share the measurement method and location, not only the final price.',
    replies: [['10000005', 'One buyer here uses a hand meter, the other guesses by feel. Ask to see the reading.', 3]] },
  { id: 'seed_post_life_02', author: '10000005', community: 'farm-life', type: 'question', ago: 3000, score: 11, tags: ['help-needed', 'farm-life'],
    title: 'How do you organize shared equipment schedules?',
    body: 'Three families share one tiller. We need a simple way to avoid conflicting times during busy weeks. What system works for your village?',
    replies: [['10000001', 'We write names on a shared wall calendar and swap by agreement one week ahead.', 3]] },
  { id: 'seed_post_livestock_02', author: '10000002', community: 'livestock', type: 'discussion', ago: 4000, score: 7, tags: ['poultry', 'feed'],
    title: 'Keeping poultry feed dry during humid weather',
    body: 'Feed is clumping during humid days even in covered storage. What low-cost storage changes worked for you?',
    replies: [['10000003', 'Raise the bags off the floor on wooden pallets and keep a small gap from the wall.', 2]] },
  { id: 'seed_post_crop_03', author: '10000004', community: 'crop-talk', type: 'local_report', ago: 1200, score: 18, tags: ['vegetables', 'pest'],
    title: 'Several vegetable plots nearby show curled leaves',
    body: 'Three growers in my area have noticed curled leaves this week. This is a community observation, not an official outbreak alert.',
    replies: [['10000005', 'Thanks for sharing. Please note which crop and how old the plants are.', 3]] },
  { id: 'seed_post_rules_01', author: '10000005', community: 'farm-life', type: 'discussion', ago: 8000, score: 30, tags: ['farm-life'], pinned: 1,
    title: 'Welcome to Farmer Circle — read before posting',
    body: 'Share honest experience, protect personal information, do not request payment, and report dangerous advice. Local reports are community reports unless marked official.',
    replies: [['10000001', 'Glad this exists. Thank you for setting it up.', 2]] },
];

