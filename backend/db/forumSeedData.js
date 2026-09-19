// Deterministic demo content for Farmer Circle (see forumSeed.js).
// ago = minutes before "now" that the post was created; score = number of +1 votes.

// [key, phone, display name, village, region code, role]. Phones are fictional; sign in with the demo PIN.
export const DEMO_USERS = [
  ['10000001', '9100000001', 'Ravi K.', 'Patna outskirts', 'IN-BR', 'member'],
  ['10000002', '9100000002', 'Asha P.', 'Rampur', 'IN-UP-01', 'member'],
  ['10000003', '9100000003', 'Minh Tran', 'Long Xuyen', 'VN-AG', 'member'],
  ['10000004', '9100000004', 'Rahim U.', 'Boalia', 'BD-RAJ', 'member'],
  ['10000005', '9100000005', 'Meena S.', 'Danapur', 'IN-BR', 'moderator'],
  ['10000006', '9100000006', 'Dr. Priya Sharma', 'Lucknow', 'IN-UP-01', 'member', 'KVK Expert'],
  ['10000007', '9100000007', 'Anil Verma', 'Kanpur', 'IN-UP-01', 'member', 'District Agronomist'],
  ['10000008', '9100000008', 'Suresh Yadav', 'Varanasi', 'IN-UP-01', 'member', 'Experienced Rice Farmer'],
  ['10000009', '9100000009', 'Agri Government', 'Uttar Pradesh', 'IN-UP-01', 'member'],
  ['10000010', '9100000010', 'AgriLink AI', 'Online', 'IN-UP-01', 'member'],
  // Uttar Pradesh districts with live mandi prices (migration 010, db/syncMandi.js): one member per
  // district, two in Lucknow so Local Market has a buyer and a seller in the same district.
  ['10000011', '9100000011', 'Rakesh Tyagi', 'Sardhana', 'IN-UP-MRT', 'member'],
  ['10000012', '9100000012', 'Kavita Chauhan', 'Fatehabad', 'IN-UP-AGR', 'member'],
  ['10000013', '9100000013', 'Imran Ali', 'Malihabad', 'IN-UP-LKO', 'member'],
  ['10000014', '9100000014', 'Sunita Maurya', 'Pindra', 'IN-UP-VNS', 'member'],
  ['10000015', '9100000015', 'Pooja Rawat', 'Bakshi Ka Talab', 'IN-UP-LKO', 'member'],
];
// Crops the demo members grow (Settings > Crops). Market Prices lists a member's own crops first.
// Codes are the ones syncMandi.js stores, so every one has live prices in Uttar Pradesh.
export const DEMO_CROPS = {
  10000002: ['rice', 'wheat'],
  10000011: ['wheat', 'potato'],
  10000012: ['potato', 'onion'],
  10000013: ['rice', 'tomato'],
  10000014: ['rice', 'wheat'],
  10000015: ['onion', 'potato'],
};
export const CROP_NAMES = [['rice', 'Rice'], ['wheat', 'Wheat'], ['onion', 'Onion'], ['tomato', 'Tomato'], ['potato', 'Potato']];
// Regions the demo needs that a fresh database may lack. Existing codes are left untouched.
// [code, country, name, latitude, longitude] - centre points match migration 008.
export const DEMO_REGIONS = [
  ['IN-BR', 'IN', 'Bihar', 25.5941, 85.1376], ['IN-UP-01', 'IN', 'Rampur, Uttar Pradesh', 28.8, 79.03],
  ['VN-AG', 'VN', 'An Giang', 10.3864, 105.4352], ['BD-RAJ', 'BD', 'Rajshahi', 24.3745, 88.6042],
  // Same rows as migration 010.
  ['IN-UP', 'IN', 'Uttar Pradesh', 26.8467, 80.9462],
  ['IN-UP-MRT', 'IN', 'Meerut, Uttar Pradesh', 28.9845, 77.7064], ['IN-UP-AGR', 'IN', 'Agra, Uttar Pradesh', 27.1767, 78.0081],
  ['IN-UP-LKO', 'IN', 'Lucknow, Uttar Pradesh', 26.8467, 80.9462], ['IN-UP-VNS', 'IN', 'Varanasi, Uttar Pradesh', 25.3176, 82.9739],
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
  { id:'seed_post_up_pest_01',author:'10000002',community:'crop-talk',type:'question',ago:80,score:14,tags:['rice','pest'],title:'Stem borer dead hearts found in young rice',body:'Dead hearts appeared in patches after moths were seen near the field. What should I count before deciding the next step?',replies:[['10000006','Check 20 hills in five places and record the percentage with dead hearts. Use local thresholds and product labels before treatment.',9,'expert']] },
  { id:'seed_post_up_pest_02',author:'10000008',community:'crop-talk',type:'discussion',ago:420,score:11,tags:['rice','pest'],title:'Leaf roller damage stayed near the field edge',body:'Folded leaves are mostly near the bund after two cloudy days. Natural enemies are still visible.',replies:[['10000007','Monitor the center separately. Avoid unnecessary spraying when damage remains below the local action threshold.',8,'expert']] },
  { id:'seed_post_up_bph_01',author:'10000002',community:'crop-talk',type:'question',ago:55,score:8,tags:['rice','pest'],title:'Brown planthopper seen at the base of rice plants',body:'Small brown insects gather near the water line in one patch. The canopy is dense and humid.',replies:[['10000010','Reduce standing water if appropriate and inspect several hills. This is an AI suggestion; consult a local expert for specific advice.',0,'ai']] },
  { id:'seed_post_up_fert_01',author:'10000007',community:'crop-talk',type:'discussion',ago:700,score:16,tags:['rice','fertilizer'],title:'Split urea applications reduce loss after rain',body:'For transplanted rice, apply nitrogen in split doses based on crop stage and soil test. Avoid applying just before heavy rain.',replies:[['10000008','Splitting the dose helped keep leaf colour more even in my field.',4,'human']] },
  { id:'seed_post_gov_01',author:'10000009',community:'farm-life',type:'discussion',ago:120,score:20,tags:['farm-life'],title:'[GOV] PM-KISAN beneficiary status reminder',body:'Check beneficiary status only at pmkisan.gov.in or through the nearest CSC. Never share an OTP with an unknown caller.',replies:[] },
  { id:'seed_post_gov_02',author:'10000009',community:'farm-life',type:'discussion',ago:300,score:18,tags:['farm-life'],title:'[GOV] PMFBY crop insurance reporting reminder',body:'Report insured crop loss promptly through official PMFBY channels and keep the acknowledgement number.',replies:[] },
  { id:'seed_post_gov_03',author:'10000009',community:'crop-talk',type:'discussion',ago:500,score:17,tags:['rice'],title:'[GOV] Weather advisory for eastern Uttar Pradesh',body:'Monitor drainage after heavy rain and follow district agriculture office advisories for field operations.',replies:[] },
  { id:'seed_post_up_market_03',author:'10000008',community:'market-talk',type:'question',ago:35,score:6,tags:['wheat','price-report'],title:'Comparing Lucknow and Kanpur mandi wheat prices',body:'The higher quote may not cover transport and loading. What transport cost per quintal are farmers seeing?',replies:[['10000010','Compare the same grade and subtract transport and loading from each quote. This is an AI suggestion, not financial advice.',0,'ai'],['10000006','Also confirm moisture deductions because quoted and realized prices can differ.',5,'expert']] },
  // Uttar Pradesh district members (10000011-10000015).
  { id: 'seed_post_up_meerut_wheat_01', author: '10000011', community: 'crop-talk', type: 'question', ago: 150, score: 9, tags: ['wheat', 'soil'], solved: 1,
    title: 'How soon do you sow wheat after the rice harvest?',
    body: 'Our rice field near Sardhana will be clear in about three weeks and the soil still holds moisture. How long do others wait before sowing wheat?',
    replies: [
      ['10000006', 'Sow when the soil is moist but not sticky. Ask your KVK which variety suits late sowing in western UP.', 6],
      ['10000014', 'We sow within a week of harvest to use the leftover moisture.', 2],
    ] },
  { id: 'seed_post_up_agra_potato_01', author: '10000012', community: 'market-talk', type: 'local_report', ago: 45, score: 7, tags: ['price-report', 'buyer-demand'],
    title: 'Potato buyers near Fatehabad want graded bags',
    body: 'Two traders asked for bags sorted by size before they would quote. Ungraded lots got a lower offer. This is my own report, not an official quote. Is grading worth the labour?',
    replies: [
      ['10000011', 'In Meerut we sort into two sizes. It took one extra day for 40 bags, but the offer improved.', 3],
      ['10000007', 'Check the mandi price in Market Prices before and after grading so you know the real difference.', 4],
    ] },
  { id: 'seed_post_up_lucknow_tomato_01', author: '10000013', community: 'crop-talk', type: 'question', ago: 95, score: 8, tags: ['vegetables', 'disease'], solved: 1,
    title: 'Tomatoes cracking after uneven watering',
    body: 'Some tomatoes in Malihabad are cracking near the stem after a dry spell followed by heavy watering. Is this a disease or a watering problem?',
    replies: [
      ['10000006', 'Cracking after uneven watering is common. Water lightly and regularly, and look for spots or rot before suspecting disease.', 5],
      ['10000015', 'Mine did the same last year. Mulching kept the soil evenly moist.', 2],
    ] },
  { id: 'seed_post_up_varanasi_transport_01', author: '10000014', community: 'farm-life', type: 'discussion', ago: 260, score: 5, tags: ['transport', 'help-needed'],
    title: 'Sharing a trolley to the mandi from Pindra',
    body: 'I will have about 12 quintal of rice next week. Does anyone near Pindra want to share one tractor trolley to the mandi to cut the transport cost?',
    replies: [['10000008', 'I can join if you go on Tuesday. Agree the loading cost before leaving.', 3]] },
];
