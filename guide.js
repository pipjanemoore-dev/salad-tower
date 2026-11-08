// The how-to guide. Each point is tagged with where it came from, so you can tell a
// supplier's published number from general practice that still needs testing here.
(function (root) {
  const src = (name) => `<span class="src src-${name.toLowerCase().replace(/\s+/g, '-')}">${name}</span>`;
  const N = src('Nutraponics');
  const L = src('Living Towers');
  const S = src('Spacetree');
  const V = src('VEVOR');
  const G = src('General');
  const O = src('Origin Hydro');
  const C = src('Your cubes');
  const B = src('Your seed box');

  const GUIDE = [
    {
      id: 'tower',
      title: 'Your setup',
      html: `
        <ul>
          <li><b>Tower:</b> 50 pods on 10 tiers (5 per tier), 20 L tank, 3.8 cm pods at 9.5 cm spacing, 35 × 35 × 132 cm, on wheels. ${V}</li>
          <li><b>Refilling:</b> VEVOR says about once a month. Expect far more often with 50 growing plants, especially in Gold Coast summer. ${G}</li>
          <li><b>Cubes:</b> green rockwool, about 25 × 25 × 40 mm, with a seed hole, in a pack of 50. ${C} A 25 mm cube should sit inside a 3.8 cm pod with room to spare. Try a dry one before sowing. If it’s loose or sits too high, it may need a snugger fit, and any gap that lets light reach wet rockwool can grow algae. ${G}</li>
        </ul>
        <h4>Pump: Aqua One Maxi 105</h4>
        <ul>
          <li>Retailers list 45 W, 2.5 m maximum head, 240 V, and 2200–2500 L/hr at best. It’s fully submersible. <span class="src">Retailers</span></li>
          <li><b>It’s a big pump for this tower.</b> Even well below its rated flow, it can move your whole 20 L in a minute or so. On the first run, watch for pods flooding, plugs washing out, or the tank level dropping too far while water is up in the tower. If so, reduce the flow. Retailers disagree on whether the 105 has its own flow control, so check yours. A valve on the outlet is the usual fix. ${G}</li>
          <li><b>It adds heat.</b> Left running, 45 W can warm 20 L by well over a degree an hour, less whatever the tank sheds. Run it on a timer, starting at 15 minutes on and 45 off. ${N} ${G}</li>
          <li><b>Timer:</b> the Smart Life app that came with the VEVOR runs the Aqua One on its timer, so that’s where to set the cycle. <span class="src">Your setup</span></li>
          <li><b>Safety:</b> power off before touching the pump or tank, keep the level above the pump, and use an RCD-protected outlet, with the plug and timer kept dry. Check that the pump’s instructions allow outdoor use on a patio. ${G}</li>
        </ul>
        <h4>Meter: GIDIGI 4-in-1</h4>
        <ul>
          <li>Reads pH, EC, TDS and temperature together. I couldn’t open your Amazon listing, and other listings conflict on accuracy, so go by your manual. <span class="src">Retailers</span></li>
          <li><b>Log EC, not TDS.</b> TDS is EC multiplied by a factor that varies between meters, while all the targets here are EC. ${G}</li>
          <li><b>Units:</b> your screen shows µS/cm, so 1400 is the same as the 1.4 mS/cm that most guides quote. Where this Guide gives EC as a small number such as 1.4, multiply by 1000 to match your meter. The Water and Plan screens already use your units. ${G}</li>
          <li><b>Calibrate before first use, then weekly.</b> ${S} Rinse the probe between uses, and store it as the manual says, since pH probes drift and fail if they dry out. ${G}</li>
        </ul>`,
    },
    {
      id: 'start',
      title: 'First start: getting the tower running',
      html: `
        <ol>
          <li>Assemble it where it will live, and use a safety-switch (RCD) protected outlet: this is mains power beside water. ${G}</li>
          <li>Fill with water only and run the pump. Look for leaks and check water reaches every tier. Never run the pump dry. ${N}</li>
          <li>Test your source water’s pH and EC, and note them. Tap water already carries some EC, which counts towards your target. ${G}</li>
          <li>Mix nutrient in the order on the label: add each part separately and stir between them. Never mix concentrates directly together. ${N}</li>
          <li>Check EC, then adjust pH last, then recheck. ${N}</li>
          <li>Calibrate both meters before their first use. ${S}</li>
          <li>Block light from the tank, since light plus warm solution is what grows algae. ${S}</li>
        </ol>
        <p>When that’s done, tap “Tower is running” on the Today screen and the routine care starts counting.</p>`,
    },
    {
      id: 'seed',
      title: 'Sowing in rockwool',
      html: `
        <ol>
          <li>Soak cubes for 2 minutes, then let them drain for about 15 minutes. ${C} Use water adjusted to about pH 5.5, the level your cube listing recommends. Check it with your meter first, because your tap water may read higher and the soak is what sets the cube’s starting pH. ${C} ${G}</li>
          <li>The listing also gives a 10-second soak in nutrient solution, and Spacetree says 10–15 minutes. ${C} ${S} No single recipe suits every plug ${N}, so the app uses the listing’s 2-minute method, which you can adjust if germination is poor.</li>
          <li>Put seed in the cube’s hole, then spray with water. ${C} Don’t push lettuce deep, as it needs light to germinate, so keep it near the top of the hole. ${G} Use 1–2 per cube ${S}, or whatever the crop’s card says.</li>
          <li>Pelleted lettuce seed makes sowing single seeds much easier. ${S}</li>
          <li>Sow 15–20% extra to cover losses. The app adds this for you. ${S}</li>
          <li>Keep at 20–24°C and 85–95% humidity under a dome. ${S} Lettuce germination can stall in hot conditions, so avoid sowing somewhere warm in summer. ${G}</li>
          <li>Mist only when the surface starts to dry. Plugs should stay evenly moist, not soggy. ${N} ${S}</li>
          <li>Thin to the strongest seedling by snipping, because pulling damages the roots of the one you’re keeping. ${G}</li>
        </ol>`,
    },
    {
      id: 'lights',
      title: 'Seedlings under lights',
      html: `
        <ul>
          <li>Give light as soon as seeds sprout, or they turn leggy. ${L}</li>
          <li>Hours: about 16. Sources say 14–16 ${L} ${N} and 16–18 ${S}, and always include a daily dark period. ${N}</li>
          <li>Keep lights about 15–20 cm above the canopy, and raise them as plants grow. ${L} If your light’s maker gives a distance, use theirs. ${G}</li>
          <li>If you have a meter: 100–200 µmol/m²/s for seedlings. ${S}</li>
          <li>Feed: plain water or EC 0.5–0.8 at first, up to about EC 0.8–1.2 before transplant. The sources differ on timing, so go by the plant. ${S}</li>
          <li>Take the dome off by about day 7. Run a gentle fan for 1–2 hours a day from about day 3–5. Moving air helps prevent damping-off. ${S}</li>
          <li>If seedlings collapse at the base, that’s damping-off. Remove them, clean trays and tools, and adjust moisture, light and airflow. ${N}</li>
        </ul>`,
    },
    {
      id: 'move',
      title: 'Tower or greenhouse? Transplant day',
      html: `
        <p><b>Straight to the tower</b> when a seedling has 2–4 true leaves, an intact plug, and roots showing through it, usually 10–14 days from sowing. ${S} Your cube listing suggests waiting for roots to come through by about 1.5–2.5 cm. ${C} Height alone isn’t the test. ${N}</p>
        <p><b>Greenhouse first</b> if roots aren’t through yet, the seedling is small, or the tower has no free pods. It’s also a good way to harden off plants coming from indoor lights if the tower is outdoors, by giving them a few days of real light and moving air. ${G} Rockwool dries out quickly there, so check daily. ${G}</p>
        <p><b>How to transplant:</b></p>
        <ol>
          <li>Have water running first, so every pod is wet. ${S}</li>
          <li>Hold the plug, not the stem. ${N}</li>
          <li>Sit the top of the plug level with the rim of the pod, with its base where it can reach the falling water. ${S}</li>
          <li>Shade for 24–48 hours if the tower is in direct sun. ${S}</li>
          <li>Check flow at those pods for the next two days. ${S}</li>
        </ol>
        <div class="callout"><b>Young and mature plants share one tank.</b> Guides suggest EC 1.0–1.2 for a transplant’s first week ${S} or half strength ${L}. That can’t be done for one batch in a succession tower, so the app’s advice is to hold EC at the low end of the target that week. ${G}</div>`,
    },
    {
      id: 'water',
      title: 'Water: pH, EC, top-ups, changes',
      html: `
        <table>
          <thead><tr><th>Job</th><th>How often</th></tr></thead>
          <tbody>
            <tr><td>Water level, flow from the top, yellow leaves</td><td>Daily ${S}</td></tr>
            <tr><td>pH and EC, at the same time, before topping up</td><td>Daily ${S}</td></tr>
            <tr><td>Clean pump inlet, calibrate pH meter, check roots</td><td>Weekly ${S}</td></tr>
            <tr><td>Change the whole tank, wipe it, flush lines</td><td>Every 2–3 weeks ${S}. The app uses 14 days because 20 L is small for 50 plants. ${G}</td></tr>
          </tbody>
        </table>
        <ul>
          <li><b>Water temperature:</b> 18–22°C. ${S} Above 24°C, take action, because a warm tank holds little oxygen. ${G}</li>
          <li><b>pH:</b> it tends to drift up as plants feed. ${S} Don’t move it more than 0.5 in 24 hours. ${S}</li>
          <li><b>pH first when correcting:</b> fix pH, then reassess EC the next day. ${S} When mixing a new tank, it’s the other way round: nutrient first, pH last, since nutrient moves pH. ${N}</li>
          <li><b>Top-ups:</b> a dropping level doesn’t mean a full dose. ${N} Use plain water between changes ${S}, and let the EC trend guide you: the Water screen tells you when it’s climbing or falling.</li>
          <li><b>pH Down:</b> follow its label. Commercial guides quote strong acid doses for large tanks, and they don’t scale safely to 20 L. ${G}</li>
        </ul>
        <div class="callout"><b>Where sources disagree on EC.</b> For leafy greens, Spacetree’s two guides say 1.2–1.8 and 1.8–2.2, and Nutraponics says 1.2–1.8 for lettuce. The app follows the crop ranges from Nutraponics. Spacetree’s “mixed tower” figure of 1.8–2.2 assumes heavy feeders and is too strong for a lettuce-led tower.</div>`,
    },
    {
      id: 'nutrients',
      title: 'Nutrients: Origin Hydro Leafy Greens and Herbs',
      html: `
        <ul>
          <li><b>Dose:</b> 5 ml of part A and 5 ml of part B per litre, so 100 ml of each for your 20 L tank. ${O}</li>
          <li><b>Order:</b> part A first, mix well, then part B. Never let the two concentrates meet, or nutrients drop out of solution. ${O}</li>
          <li><b>Result:</b> about EC 1.4 and pH 6.7, depending on your water. Measure your first mix and note it, since your tap water affects both. ${O}</li>
          <li><b>pH Down:</b> 6.7 is above every salad target here, so use your pH Down at each tank change. The nutrient barely moves pH (about 0.03 per ml per litre). ${O} Add it a few drops at a time. ${G}</li>
          <li><b>Raising EC:</b> each extra 1 ml of A and 1 ml of B per litre adds about 0.18 EC, which is 20 ml of each in a full tank. ${O} The Water screen uses this to suggest amounts. Those amounts are estimates, so retest after adding.</li>
          <li><b>Seedlings:</b> start with lower EC and build up as they grow. ${O} Half strength is 2.5 ml of each per litre. ${G}</li>
          <li><b>Calcium and magnesium are included,</b> so you shouldn’t need Cal-Mag. It also uses two forms of iron to stay available across a wider pH range. ${O}</li>
          <li><b>Other brands’ figures don’t apply.</b> The Living Towers amounts are for its own product. ${L}</li>
          <li>The label doesn’t give storage or tank-change advice. Keep the bottles cool and out of direct sun. ${G}</li>
        </ul>`,
    },
    {
      id: 'goldcoast',
      title: 'Growing on a Gold Coast patio',
      html: `
        <p>Your Broadbeach seed-box calendar and this table should work together. Being on wheels is a real advantage here. Most guides assume a cold winter and a mild summer, but on the Gold Coast it’s closer to the reverse: lettuce likes winter and struggles in summer. Queensland’s commercial lettuce mostly comes from cooler inland districts for that reason. ${src('Qld Government')}</p>
        <table>
          <thead><tr><th>When</th><th>Where to park it</th><th>Grow</th></tr></thead>
          <tbody>
            <tr><td>Nov–Mar</td><td>Bright shade, with morning sun at most, or shade cloth</td><td>Lettuce in small batches, picked young, plus basil, shiso and other heat lovers. Expect some bolting.</td></tr>
            <tr><td>Apr, Oct</td><td>Morning sun, afternoon shade</td><td>Salad greens, and start or finish the heat lovers.</td></tr>
            <tr><td>May–Sep</td><td>Direct sun for much of the day</td><td>The best lettuce months, for what you sowed from March. Add pak choi, tatsoi, spinach and kale.</td></tr>
          </tbody>
        </table>
        <p class="subtle">These dates are my judgement from general climate knowledge, not from a local growing guide. Adjust them as you see how your patio behaves.</p>
        <ul>
          <li><b>Most lettuce starts bolting at about 27°C.</b> <span class="src">UC Extension</span> Gold Coast summer days go past this, so pick early and expect shorter runs.</li>
          <li><b>Summer varieties to look for:</b> Red Cross and Aunt Mae’s Bibb (butterhead), Muir (summer crisp), and Great Lakes (a large crisphead, which is a stretch for these pods). <span class="src">Seed retailers</span> Not all of these may be sold locally, and a local seed supplier will know what does well. ${src('Qld Government')}</li>
          <li><b>Is your indirect light enough?</b> If plants turn leggy or pale, roll them somewhere brighter. ${L}</li>
          <li><b>Greenhouse in summer:</b> a small greenhouse can get far too hot. Open it right up and use shade cloth, or raise seedlings in bright patio shade instead. ${G}</li>
          <li><b>Storms and wind:</b> it’s tall, with a 5 kg frame on wheels. Lock the wheels and roll it under cover before storms. ${G}</li>
          <li><b>Humidity:</b> keep air moving between plants and remove old leaves, since mildew spreads in humid weather. ${G}</li>
          <li><b>Mosquitoes:</b> keep tank openings covered so they can’t breed in the water. ${G}</li>
        </ul>`,
    },
    {
      id: 'seedbox',
      title: 'Your seed box',
      html: `
        <p>The app holds the 89 packets your sheet marks for the tower: 44 tower stars and 45 worth a try. See them on the <a href="#/seeds">Seed box</a> screen. ${B}</p>
        <ul>
          <li><b>Only in-season seed is offered.</b> Sow forms, sowing reminders and the Plan’s add-crop list filter by today’s date. Out-of-season packets stay visible on the Seed box screen, without a sow button. A planned crop pauses when it goes out of season and restarts by itself. ${G}</li>
          <li><b>Your sowing calendar comes first.</b> Sow now, Now or autumn, and Autumn are yours. The app reads them as September to February, all year, and March to August. The last one runs past your March to May note because winter is the best lettuce time here, and your Salad Bowl Red packet gives February to October for the subtropics. ${B} ${G}</li>
          <li><b>Soil-only and toxic plants aren’t included.</b> That includes wormwood, foxglove and the other plants you listed to keep out. ${B}</li>
          <li><b>Thiram-coated seed:</b> Mizuna Purple, Capsicum Yolo Wonder and Cucumber Heirloom Mix. ${B} A fungicide coating and a shared food tank don’t mix well, and none of my sources covers it, so the app leaves these out of suggestions. An untreated packet is the safer choice, especially for the mizuna, which you’d eat as leaves. ${G}</li>
          <li><b>Worth-a-try plants:</b> your sheet allows for stakes and top pockets. Many will be a tight fit in 3.8 cm pods at 9.5 cm spacing, on a 5 kg frame, so try one or two of a kind first. ${G}</li>
          <li><b>Most profiles for your extra plants are estimates.</b> Nutraponics doesn’t cover plants such as shiso, tatsoi or lemon balm. The Crop library marks these, and pH and EC targets that include them are less certain. ${G}</li>
          <li><b>Older seed:</b> your sheet shows some packets collected in April 2024. If germination is patchy, sow a few extra. ${G}</li>
          <li><b>Seed tips</b> such as depth and spacing come from the packets for soil, so spacing doesn’t apply in pods. ${B} Some tips still matter, such as chilling strawberry seed for 2 weeks or soaking parsley overnight.</li>
        </ul>`,
    },
    {
      id: 'succession',
      title: 'How succession planting works here',
      html: `
        <p>Sow small batches on a regular rhythm, so a few pods come free and get replanted each week and the tower never has one big empty moment. A 7-day stagger is what gives a weekly harvest. ${S}</p>
        <p>The Plan screen does the sums. If you give a crop P pods and each plant stays T days, then each sowing should fill P × (days between sowings ÷ T) pods. The stay lengths are estimates ${G}, so adjust once you know how your plants really perform.</p>
        <ul>
          <li><b>Whole-head crops</b> can be cut, the plug pulled, and a new seedling planted the same day. ${S}</li>
          <li><b>Keep a small spare batch</b> of seedlings going. ${N} That’s what the greenhouse is great for.</li>
          <li><b>Placement:</b> put tall and trailing crops where they won’t shade others, with lettuce in upper and middle pods. ${L} Spacetree suggests the opposite: fast crops low, trailing crops on top. ${S} The app follows Living Towers, because on this narrow tower a trailing plant on top would shade everything below it. See how your light falls and change it if needed.</li>
        </ul>`,
    },
    {
      id: 'harvest',
      title: 'Harvesting and storing',
      html: `
        <ul>
          <li><b>Outer leaves:</b> take large outside leaves and leave the centre growing. Good for loose leaf and butterhead. ${L}</li>
          <li><b>Cut and come again:</b> cut 2–3 cm above the crown, for around 3–5 cuts per plug. ${S}</li>
          <li><b>Whole head:</b> let it mature, cut at the base, remove the plug and replant. ${S}</li>
          <li><b>Herbs:</b> pinch tips just above a node. ${S}</li>
          <li><b>First harvest</b> is typically 3–4 weeks after transplanting lettuce ${L}, or 30–40 days from seed. ${S}</li>
          <li><b>Pick in the coolest part of the day</b> and refrigerate promptly. ${S} Store in a container with a slightly damp paper towel, away from apples and bananas. Limp leaves perk up after a short soak in iced water. ${L}</li>
          <li><b>Bolting:</b> if the centre stretches upwards, harvest now, because the leaves are turning bitter. ${L}</li>
        </ul>`,
    },
    {
      id: 'trouble',
      title: 'Troubleshooting',
      html: `
        <table>
          <thead><tr><th>You see</th><th>Likely cause and what to do</th></tr></thead>
          <tbody>
            <tr><td>Leggy seedlings</td><td>Not enough light. Check hours and light distance. ${L}</td></tr>
            <tr><td>Pale or yellow leaves</td><td>Check water delivery, light, pH and EC before changing the mix. ${N}</td></tr>
            <tr><td>Yellow between veins on new growth</td><td>Often iron lockout from high pH. Fix pH first. ${S}</td></tr>
            <tr><td>Oldest outer leaves yellowing only</td><td>Natural ageing. Remove them. ${L}</td></tr>
            <tr><td>Wilting</td><td>Heat, solution too strong, or poor flow. Check level, pump, temperature and EC. ${L}</td></tr>
            <tr><td>Brown tips on inner leaves (tip burn)</td><td>Calcium isn’t reaching the leaf. Check strength, airflow, humidity and temperature before adding calcium. ${L} ${S}</td></tr>
            <tr><td>Bitter leaves</td><td>Heat or bolting. Harvest sooner and choose heat-tolerant varieties. ${L}</td></tr>
            <tr><td>Stunted growth, purple stems</td><td>Possibly cold water limiting phosphorus. Check water temperature. ${S}</td></tr>
            <tr><td>Green slime on the tank or pods</td><td>Algae, from light on warm solution. Block the light and change the solution. ${S}</td></tr>
            <tr><td>Brown, slimy, smelly roots</td><td>Root rot, usually from warm water. Cool and shade the tank, change the solution, and remove badly affected plants. ${G}</td></tr>
            <tr><td>Dry pods on one tier</td><td>Blocked water path or low pump run. Clear roots and check flow at each tier. ${G}</td></tr>
          </tbody>
        </table>`,
    },
    {
      id: 'pests',
      title: 'Pests',
      html: `
        <ul>
          <li>Check leaf undersides and crowns regularly, so you catch them while there are only a handful. ${S}</li>
          <li><b>Aphids:</b> new growth and leaf undersides. ${L} A strong spray of water knocks many off. ${G}</li>
          <li><b>Whiteflies:</b> under leaves. ${L} Yellow sticky traps help you spot them. ${G}</li>
          <li><b>Caterpillars:</b> chewed holes. ${L} Pick them off. ${G}</li>
          <li><b>Leafminers:</b> pale winding trails. ${L} Remove affected leaves. ${G}</li>
          <li>Don’t reach for a chemical automatically: rule out other problems first. ${N} Anything you use must be labelled for food crops, should be kept out of the tank, and needs its withholding period observed. ${G}</li>
        </ul>`,
    },
    {
      id: 'sources',
      title: 'Where this came from',
      html: `
        <ul>
          <li>${N} <a href="https://nutraponics.com/learn-how-to-grow-more/" target="_blank" rel="noopener">Crop library and guides</a>: per-crop pH, EC, light, pump cycle and first harvest.</li>
          <li>${L} <a href="https://livingtowers.com/blogs/living-towers-blog/how-to-grow-lettuce-in-a-tower-garden-year-round" target="_blank" rel="noopener">Growing lettuce in a tower</a>: varieties, harvest, troubleshooting.</li>
          <li>${S} <a href="https://spacetree.store/hydroponic-tower-nutrient-solution-complete-guide-to-formulation-ph-and-feeding-schedules/" target="_blank" rel="noopener">Nutrient guide</a> and <a href="https://spacetree.store/from-seed-to-harvest-a-step-by-step-hydroponic-tower-planting-guide-for-commercial-growers/" target="_blank" rel="noopener">planting guide</a>: germination, routines. Written by a commercial tower seller, with some inconsistencies.</li>
          <li>${V} <a href="https://www.vevor.com.au/hydroponics-growing-system-tower-c_44884/vevor-hydroponic-tower-50-pods-10-tiers-hydroponics-growing-system-kit-with-app-control-casters-vertical-home-garden-with-20l-water-tank-pump-planter-for-indoor-herbs-fruits-and-vegetables-p_010834700306" target="_blank" rel="noopener">Product listing</a>: tower specifications.</li>
          <li>${O} <a href="https://www.originhydro.com.au/hydroponic-nutrient-kits/hydroponic-nutrient-liquid/hydroponic-nutrient-liquid-for-leafy-greens-and-herbs" target="_blank" rel="noopener">Product page</a>: dose, mixing order, expected EC and pH.</li>
          <li>${src('Qld Government')} <a href="https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/crops/fruit-veg/lettuce/grow" target="_blank" rel="noopener">Growing lettuce</a>: growing districts, varieties.</li>
          <li>${G} General hydroponic practice not stated in your sources, including time in tower and regrowth estimates. Treat these as starting points and adjust them to what you see.</li>
        </ul>`,
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = { GUIDE };
  else root.TowerGuide = { GUIDE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
