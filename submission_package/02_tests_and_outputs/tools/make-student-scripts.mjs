/**
 * Builds the train and test student answer scripts for the GradeSense evaluation set.
 *
 *   node submission_package/02_tests_and_outputs/tools/make-student-scripts.mjs
 *
 * Each script is written the way a real candidate would answer the paper in an exam:
 * uneven paragraph lengths, spelling slips, a struck-out line here and there, and
 * hand-drawn diagrams. The profiles are chosen to span the failure modes a grader has
 * to survive — a model-quality answer, partial credit, a confident misconception, a
 * blank page, scan noise, an answer that disagrees with the model answer but argues it
 * well, padding without content, and a numerically wrong but internally consistent one.
 *
 * `expected` is the human ground truth for each script, written before the pipeline was
 * ever run against it. It is what outputs/results_summary.csv is scored against.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script, renderScript } from './pdfkit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(HERE, '..', 'dataset');

const Q1 = 'Question 1 — Science (5 marks)';
const Q2 = 'Question 2 — English (5 marks)';
const Q3 = 'Question 3 — Economics (5 marks)';

const scripts = [];

const add = (meta, build) => {
  const s = new Script(meta);
  build(s);
  scripts.push({ meta, script: s });
};

/* ------------------------------------------------------------------ TRAIN -- */

add(
  {
    id: 'TR-01',
    split: 'train',
    file: 'TR-01_full-credit.pdf',
    name: 'Ananya Iyer',
    roll: 'S-1042',
    profile: 'Full credit — complete, correctly reasoned answers to all three questions.',
    expected: { q1: 5, q2: 5, q3: 5, total: 15 },
    tests: 'Correct answer: every rubric point should be CORRECT and the total should be the paper maximum.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'An electric circuit is a closed conducting path through which current can flow. The battery ' +
        'provides the potential difference that pushes the current around the circuit. The switch is used ' +
        'to open or close this path. When the switch is closed the path is complete and current flows ' +
        'through the resistor and the bulb; when it is open the path is broken and no current flows at all.'
    );
    s.para(
      'In my diagram the battery, switch, resistor, bulb and ammeter are all joined in one closed loop, ' +
        'that is, in series. The ammeter has to be in series because the current it measures is the same ' +
        'current that passes through the components. The voltmeter is connected in parallel across the bulb, ' +
        'because it measures the potential difference between the two ends of the bulb and not the current ' +
        'through it.'
    );
    s.para(
      'Conventional current is taken to flow from the positive terminal of the battery, through the switch, ' +
        'resistor, bulb and ammeter, and back into the negative terminal. I have marked this direction with ' +
        'an arrow on the diagram.'
    );
    s.para(
      'The current depends on the voltage and the resistance together. By Ohm’s law V = IR, so I = V/R. ' +
        'If the battery voltage is kept the same and the resistance is increased, the current becomes smaller. ' +
        'If the resistance is reduced, a larger current flows. The bulb would therefore glow more dimly if I ' +
        'increased the resistance.'
    );
    s.circuit({ caption: 'Fig 1 — Series circuit with voltmeter in parallel across the bulb' });

    s.pageBreak();
    s.heading(Q2);
    s.para(
      'Technology has changed how students learn because information that was once hard to reach is now ' +
        'available in seconds. A student can use digital libraries, videos and interactive tools to understand ' +
        'a concept that did not make sense in class. This makes learning flexible, because each student can go ' +
        'at their own pace. For example, when I could not follow a chemistry topic in class, I watched three ' +
        'different explanations online until one of them finally made sense to me.'
    );
    s.para(
      'On the other hand, easy access can create dependence. A student who searches for the answer to every ' +
        'hard question finishes the homework but never builds the habit of working a problem out. There is ' +
        'also the risk of accepting wrong information just because it appeared on a website that looked ' +
        'trustworthy. Somebody who only copies is really practising searching, not thinking.'
    );
    s.para(
      'In my opinion technology does not automatically make students better or worse learners; the effect ' +
        'depends entirely on how it is used. It helps most when it is used to understand a concept, compare ' +
        'explanations and check your own work, and it harms when it replaces the effort of thinking. So I ' +
        'would say technology should be treated as a tool that supports thinking rather than a substitute ' +
        'for it.'
    );

    s.pageBreak();
    s.heading(Q3);
    s.para(
      'I have plotted quantity on the horizontal axis and price on the vertical axis. The demand curve slopes ' +
        'downward from left to right because consumers buy more when the price falls. The supply curve slopes ' +
        'upward from left to right because producers are willing to sell more when the price rises.'
    );
    s.para(
      'The two curves cross at a price of Rs 30 and a quantity of 60 units. This is the market equilibrium, ' +
        'because at this price quantity demanded is exactly equal to quantity supplied and there is no pressure ' +
        'for the price to change.'
    );
    s.para(
      'If the market price is below Rs 30, say Rs 20, then 80 units are demanded but only 40 are supplied. ' +
        'This is a shortage: buyers want more than sellers will supply, so the price is pushed upward. If the ' +
        'price is above Rs 30, say Rs 40, then 80 units are supplied but only 40 are demanded. This is a ' +
        'surplus, and unsold stock pushes the price back downward. Either way the market moves back towards ' +
        'the equilibrium.'
    );
    s.para(
      'If the cost of production rises, producing each unit is less profitable at the old price, so producers ' +
        'supply less at every price. The whole supply curve therefore shifts to the left (upward), shown as S1 ' +
        'on my graph. Assuming demand does not change, the new equilibrium is at a higher price and a lower ' +
        'quantity than before.'
    );
    s.supplyDemand({
      caption: 'Fig 2 — Demand and supply, with the supply curve after a cost increase',
      shiftedSupply: true,
    });
  }
);

add(
  {
    id: 'TR-02',
    split: 'train',
    file: 'TR-02_partial-credit.pdf',
    name: 'Rohit Menon',
    roll: 'S-1057',
    profile:
      'Partial credit — the core idea of each question is there, but the instrument placement, the counter-argument and the cost-shift analysis are all missing.',
    expected: { q1: 3, q2: 3, q3: 3, total: 9 },
    tests: 'Partial answer: marks should be awarded proportionally, with the missing rubric points named rather than silently rolled into the total.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A circuit is a closed path for current. The battery gives the voltage and the switch opens and closes ' +
        'the circuit. When the switch is closed the current flows through the bulb and the resistor and the ' +
        'bulb lights up. When it is open nothing flows.'
    );
    s.para(
      'I have drawn the battery, switch, resistor and bulb in one loop. The ammeter and the voltmeter are also ' +
        'shown in the diagram.'
    );
    s.para(
      'If the resistance is increased the current becomes less because the resistance opposes the flow of ' +
        'current.'
    );
    s.circuit({
      caption: 'Fig 1 — Circuit',
      ammeterInParallel: true,
      showCurrentDirection: false,
    });

    s.heading(Q2);
    s.para(
      'Technology has made learning much easier for students. Everything is available on the internet now, so ' +
        'if you do not understand something in class you can just look it up at home. There are videos, notes ' +
        'and websites for every subject and they are mostly free.'
    );
    s.para(
      'For example, a student who misses school because of illness can still catch up with the lessons by ' +
        'watching recordings. Earlier this was not possible and the student would simply fall behind.'
    );
    s.para('So I think technology has helped students learn better than before.');

    s.pageBreak();
    s.heading(Q3);
    s.para(
      'The demand curve goes downward and the supply curve goes upward. They meet at Rs 30 and 60 units, which ' +
        'is the equilibrium point because at that price the quantity demanded and the quantity supplied are the ' +
        'same.'
    );
    s.struck('If the price is Rs 20 the supply is more than the demand');
    s.para(
      'When the price is below the equilibrium the demand is more than the supply, so there is a shortage of ' +
        'goods in the market. When the price is above the equilibrium there is a surplus because too much is ' +
        'produced.'
    );
    s.supplyDemand({ caption: 'Fig 2 — Demand and supply graph' });
  }
);

add(
  {
    id: 'TR-03',
    split: 'train',
    file: 'TR-03_incorrect.pdf',
    name: 'Kabir Shah',
    roll: 'S-1063',
    profile:
      'Confidently wrong — voltmeter in series, resistance stated to increase current, equilibrium read off the wrong row, and an English answer that asserts without support.',
    expected: { q1: 1, q2: 1, q3: 1, total: 3 },
    tests: 'Incorrect answer: near-zero marks, and every wrong statement should come back with a correction rather than only a lost mark.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A circuit is a path made of wires where electricity travels from one end of the battery to the other. ' +
        'The battery stores the current inside it and releases it when the switch is pressed.'
    );
    s.para(
      'The voltmeter should be connected in series with the bulb so that all the voltage passes through it and ' +
        'can be measured properly. The ammeter I have connected across the wire so that it can catch the ' +
        'current going past.'
    );
    s.para(
      'If we increase the resistance in the circuit then the current increases, because the resistor pushes ' +
        'the current forward and makes the bulb brighter. This is why bigger resistors are used in bright ' +
        'lights.'
    );
    s.circuit({
      caption: 'Fig 1 — My circuit',
      voltmeterInSeries: true,
      ammeterInParallel: true,
      showCurrentDirection: false,
    });

    s.heading(Q2);
    s.para(
      'Technology is very good and it is the future. Everybody uses technology today and it has made ' +
        'everything better. Students should use technology because it is modern and fast.'
    );
    s.para('Therefore technology is good for learning and all schools should use it.');

    s.pageBreak();
    s.heading(Q3);
    s.para(
      'From the table the equilibrium is at Rs 10 and 100 units, because that is the row where the demand is ' +
        'the highest. Equilibrium means the point where the buyers are the most happy.'
    );
    s.para(
      'If the price goes below the equilibrium there will be a surplus because nobody wants to buy at a low ' +
        'price. If the price goes above it there will be a shortage because the sellers keep the goods with ' +
        'them.'
    );
    s.para(
      'If the cost of production increases the supply curve will shift to the right because the company has ' +
        'to sell more units to cover the cost, and the price will come down.'
    );
    s.supplyDemand({
      caption: 'Fig 2 — Graph',
      equilibrium: { price: 10, qty: 100 },
      equilibriumLabel: 'E (Rs 10, 100 units)',
    });
  }
);

add(
  {
    id: 'TR-04',
    split: 'train',
    file: 'TR-04_blank.pdf',
    name: 'Sana Qureshi',
    roll: 'S-1071',
    profile: 'Effectively blank — the script was handed in with only the headings copied out.',
    expected: { q1: 0, q2: 0, q3: 0, total: 0 },
    tests: 'Blank answer: every rubric point should be MISSING with zero marks, and the run must not invent evidence boxes for text that is not on the page.',
  },
  (s) => {
    s.heading(Q1);
    s.para('Explain how a simple electric circuit works.');
    s.space(40);

    s.heading(Q2);
    s.struck('Technology has made');
    s.space(40);

    s.heading(Q3);
    s.para('Not attempted.');
    s.space(30);
  }
);

add(
  {
    id: 'TR-05',
    split: 'train',
    file: 'TR-05_ocr-noise.pdf',
    name: 'Devansh Rao',
    roll: 'S-1080',
    profile:
      'Correct content carried through a poor scan — the same substance as TR-01, degraded with the character confusions a real OCR pass produces (rn/m, l/1, 0/O, split words).',
    expected: { q1: 4.5, q2: 4.5, q3: 4.5, total: 13.5 },
    tests: 'OCR noise: evidence should still be located by fuzzy match, and marks should not collapse because of spelling damage.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'An electric circult is a clcsed conducting path throuqh which currerit can flow. The batery provides ' +
        'the potential diference that drives the current. The swltch opens or clcses the path, and when it is ' +
        'clcsed the current passes throuqh the resistor and the bufb.'
    );
    s.para(
      'The batery, swltch, resistor, bufb and ammeter are all conected in serles in one closed loop. The ' +
        'ammeter must be in serles because it measures the currerit flowing throuqh the circult. The voltrneter ' +
        'is conected in paralel across the bufb because it measures the potentia1 diference between the two ' +
        'ends of the bufb.'
    );
    s.para(
      'Conventiona1 currerit flows from the positlve termina1 of the batery throuqh the externa1 circult to ' +
        'the neqative termina1, as shown by the arrow.'
    );
    s.para(
      'By 0hm’s law V = lR. lf the voltaqe stays the same and the resistarice is increased, the currerit ' +
        'throuqh the circult decreases. Reducing the resistarice lets rnore currerit flow.'
    );
    s.circuit({ caption: 'Fiq 1 - Clrcuit dlagrarn' });

    s.pageBreak();
    s.heading(Q2);
    s.para(
      'Technolcgy has changed how students learn because inforrnation that was once hard to reach is now ' +
        'availabIe in seconds. A student can watch a vidoe or read an explanation until a dificult concept ' +
        'becomes clear, and can work at their own pace.'
    );
    s.para(
      'However, easy acess can also create depericlence. A student who lccks up every answer finishes the ' +
        'homewcrk but never learns to reason it out, and rnay accept wrong inforrnation just because it is ' +
        'onIine.'
    );
    s.para(
      'ln my oplnion technolcgy is neither gcod nor bad by itseIf. lt depends on whether the student uses it ' +
        'to understarid or only to copy. lt should suport thinking, not replace it.'
    );

    s.heading(Q3);
    s.para(
      'Quantity is on the horizonta1 axls and prlce on the vertica1 axls. The demarid curve slopes downward ' +
        'and the suply curve slopes upward. They intersect at Rs 3O and 6O units, which is the equilibriurn ' +
        'because quantity demarided equals quantity suplied there.'
    );
    s.para(
      'BeIow the equilibriurn prlce there is a shortaqe because demarid exceeds suply, which pushes the prlce ' +
        'up. Abcve it there is a surpIus because suply exceeds demarid, which pushes the prlce down.'
    );
    s.para(
      'lf the cost of prcduction rlses, producers suply less at every prlce, so the suply curve shifts to the ' +
        'Ieft. The new equilibriurn has a higher prlce and a Iower quantity.'
    );
    s.supplyDemand({ caption: 'Fiq 2 - Demarid and suply', shiftedSupply: true });
    s.note('Scan quality note: this script was digitised from a faint photocopy.');
  }
);

/* ------------------------------------------------------------------- TEST -- */

add(
  {
    id: 'TE-01',
    split: 'test',
    file: 'TE-01_strong-with-gap.pdf',
    name: 'Meera Krishnan',
    roll: 'S-2011',
    profile:
      'Strong overall, one clean gap — Q3 never explains what happens away from equilibrium, which should cost exactly one rubric point and no more.',
    expected: { q1: 5, q2: 5, q3: 4, total: 14 },
    tests: 'A single missing rubric point must be isolated to that point, not spread across the question.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A simple circuit is a complete conducting loop. The cell provides the potential difference that drives ' +
        'the current, the switch makes or breaks the loop, the resistor limits the current and the bulb ' +
        'converts electrical energy into light and heat. With the switch closed there is a continuous path and ' +
        'current flows; with it open the path is broken and the bulb goes out.'
    );
    s.para(
      'The ammeter is placed in the main loop, in series with the bulb and resistor, since the whole current ' +
        'has to pass through it to be measured. The voltmeter is connected in parallel, across the two ends of ' +
        'the bulb, because it compares the potential at either side of the bulb. Putting the voltmeter in the ' +
        'main loop would be wrong.'
    );
    s.para(
      'The arrow on my diagram shows conventional current leaving the positive terminal and returning to the ' +
        'negative terminal. Since V = IR and the battery voltage is fixed, increasing R must reduce I. That is ' +
        'why adding resistance dims the bulb.'
    );
    s.circuit({ caption: 'Fig 1 — Series circuit, voltmeter across the bulb' });

    s.pageBreak();
    s.heading(Q2);
    s.para(
      'Access to information is not the same thing as learning, and I think that distinction is the heart of ' +
        'this statement. Technology has removed the barrier of finding out; it has not removed the work of ' +
        'understanding.'
    );
    s.para(
      'Where technology clearly helps is in repetition and choice. If one explanation does not work, a student ' +
        'can find another. When I was preparing for my mathematics test I used a graphing tool to see what ' +
        'changing a coefficient actually did to the curve, which no amount of re-reading the textbook had made ' +
        'clear to me.'
    );
    s.para(
      'The opposing case is real, though. A student who reaches for a search result at the first difficulty ' +
        'never sits with a problem long enough to learn from it, and struggling with a question is a large part ' +
        'of how understanding is built. Instant answers can quietly remove that struggle.'
    );
    s.para(
      'My conclusion is that technology raises the ceiling and lowers the floor at the same time. A student who ' +
        'already wants to understand gets far more out of it than before; a student who wants to be finished ' +
        'gets finished faster. The tool is the same, and the outcome depends on the intention behind it.'
    );

    s.heading(Q3);
    s.para(
      'On my graph quantity is on the x-axis and price on the y-axis. Demand slopes down because people buy ' +
        'more at lower prices, and supply slopes up because producers offer more at higher prices. The curves ' +
        'cross at Rs 30 and 60 units. That is the equilibrium: at Rs 30 the quantity demanded and the quantity ' +
        'supplied are both 60, so the market clears exactly.'
    );
    s.para(
      'If the cost of production goes up, each unit is less profitable, so producers are willing to supply less ' +
        'at every price and the supply curve shifts to the left. With demand unchanged, the new intersection ' +
        'lies at a higher price and a lower quantity than before, which I have marked as E1.'
    );
    s.supplyDemand({ caption: 'Fig 2 — Demand and supply with shifted supply', shiftedSupply: true });
  }
);

add(
  {
    id: 'TE-02',
    split: 'test',
    file: 'TE-02_contrarian-argument.pdf',
    name: 'Aarav Bansal',
    roll: 'S-2019',
    profile:
      'Argues the opposite conclusion to the model answer for Q2, but argues it properly — position, development, counter-view, example, conclusion.',
    expected: { q1: 4, q2: 5, q3: 5, total: 14 },
    tests: 'The grader must reward quality of reasoning, not similarity to the model answer. A well-argued disagreement should still score 5/5 on Q2.',
  },
  (s) => {
    s.heading(Q2);
    s.note('Answered out of order — Q2 first, as permitted.');
    s.para(
      'I disagree with the popular view. I think easy access to information has, on balance, made students ' +
        'worse learners, and I want to argue that carefully rather than just assert it.'
    );
    s.para(
      'Learning happens when you hold a difficulty in your head long enough to resolve it. That process is ' +
        'uncomfortable, and every shortcut out of the discomfort is taken. Before search engines, a student ' +
        'stuck on a problem had no option but to reread, reason and ask. Now the exit is one tap away, and the ' +
        'exit is always taken first. What is practised is retrieval of somebody else’s reasoning, not the ' +
        'construction of your own.'
    );
    s.para(
      'I have watched this in my own class. When we were given a set of unseen problems, most of us including ' +
        'me found worked solutions online within minutes and copied the method. In the test two weeks later, ' +
        'where nothing could be looked up, the same problems were much harder than they should have been. We ' +
        'had read the solutions; we had not learned to produce them.'
    );
    s.para(
      'The strongest argument against my position is that technology gives access to students who would ' +
        'otherwise have none — a student without a good teacher can now find an excellent explanation for ' +
        'free. I accept that this is a genuine and important gain, and for a motivated student it is ' +
        'transformative. But that student is exactly the one who would have found a way regardless. For the ' +
        'ordinary student, the same tool mostly removes the need to think.'
    );
    s.para(
      'So my conclusion is that the technology is not neutral in practice, even if it is neutral in principle. ' +
        'It reliably reduces the amount of struggle in a student’s day, and since struggle is where learning ' +
        'comes from, it has made most students worse learners even while making them better informed.'
    );

    s.pageBreak();
    s.heading(Q1);
    s.para(
      'A circuit is a closed loop of conductors. The battery supplies the potential difference, the switch ' +
        'completes or breaks the loop, and current flows through the resistor and the bulb only when the loop ' +
        'is complete. The ammeter is in the loop itself, in series, because the same current flows through ' +
        'every series component. The voltmeter goes across the bulb in parallel, since it measures the ' +
        'difference in potential between the bulb’s two ends.'
    );
    s.para('Increasing the resistance reduces the current, because for a fixed voltage I = V/R.');
    s.circuit({ caption: 'Fig 1 — Circuit', showCurrentDirection: false });

    s.heading(Q3);
    s.para(
      'Price is on the vertical axis, quantity on the horizontal. Demand slopes downward, supply slopes ' +
        'upward, and the two cross at Rs 30 and 60 units. At that price quantity demanded equals quantity ' +
        'supplied, which is why it is the equilibrium.'
    );
    s.para(
      'Below Rs 30 buyers want more than sellers will supply, so there is a shortage and the price is bid up. ' +
        'Above Rs 30 sellers bring more than buyers want, so there is a surplus and the price is cut. In both ' +
        'cases the market is pushed back towards Rs 30.'
    );
    s.para(
      'A rise in production costs makes supplying less profitable at every price, so the supply curve shifts ' +
        'left. The new equilibrium sits higher up the demand curve: a higher price and a smaller quantity ' +
        'traded.'
    );
    s.supplyDemand({ caption: 'Fig 2 — Market equilibrium and a leftward supply shift', shiftedSupply: true });
  }
);

add(
  {
    id: 'TE-03',
    split: 'test',
    file: 'TE-03_padded-shallow.pdf',
    name: 'Zoya Farooqui',
    roll: 'S-2026',
    profile:
      'Long but empty — restates the question at length, repeats itself, and rarely commits to a testable claim.',
    expected: { q1: 2, q2: 2, q3: 1.5, total: 5.5 },
    tests: 'Length must not be mistaken for correctness: marks should track the rubric points actually satisfied.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'The question asks us to explain how a simple electric circuit works and to illustrate the explanation ' +
        'with a properly labelled circuit diagram. This is a very important topic in physics and it is used in ' +
        'many places in daily life, such as in homes, in schools, in offices and in industries. Without ' +
        'circuits, modern life would not be possible at all.'
    );
    s.para(
      'A simple electric circuit consists of several components. These components include a battery, a switch, ' +
        'a bulb, a resistor, an ammeter and a voltmeter. Each of these components has its own function and all ' +
        'of them are important. If any one of them is missing the circuit will not work in the proper way.'
    );
    s.para(
      'The current flows in the circuit and this flow of current is what makes the bulb glow. The battery is ' +
        'the source of the electricity. The switch is used for switching. The resistor is used for resistance. ' +
        'The ammeter and the voltmeter are the measuring instruments of the circuit and they are used for ' +
        'measurement purposes.'
    );
    s.para(
      'Therefore we can conclude that a simple electric circuit is a very useful arrangement and all the ' +
        'components must be connected properly for the circuit to work correctly.'
    );
    s.circuit({ caption: 'Fig 1 — Circuit diagram', showCurrentDirection: false, ammeterInParallel: true });

    s.pageBreak();
    s.heading(Q2);
    s.para(
      'Technology has made information easier to access, but easier access to information does not necessarily ' +
        'mean better learning. This statement is a very important statement and it makes us think deeply about ' +
        'the role of technology in the field of education in the present day scenario.'
    );
    s.para(
      'There are two sides to every coin. On the one hand, technology is very useful and helpful for the ' +
        'students. On the other hand, technology can also be harmful if it is not used in the correct manner. ' +
        'Different people have different opinions about this matter and both the opinions have their own value.'
    );
    s.para(
      'Many students today are using technology for their studies. They use mobile phones, laptops, tablets ' +
        'and computers. All of these devices are very advanced and they contain a lot of information which was ' +
        'not available to students in the earlier times.'
    );
    s.para(
      'In conclusion, I would like to say that technology is a double edged sword and students should use it ' +
        'wisely and carefully for their own benefit and for the benefit of society as a whole.'
    );

    s.heading(Q3);
    s.para(
      'The table given in the question shows the price of the product and the quantity demanded and the ' +
        'quantity supplied at each price. We have to draw the demand and supply graph using this data and then ' +
        'explain what the graph tells us about the market.'
    );
    s.para(
      'From the graph we can see the demand curve and the supply curve. The demand curve is showing the ' +
        'demand and the supply curve is showing the supply. Where they meet is a very important point in ' +
        'economics and it tells us a lot about the market condition.'
    );
    s.para(
      'The market is affected by many factors such as the price, the cost of production, the behaviour of ' +
        'consumers and the behaviour of producers. All these factors together decide what happens in the ' +
        'market at any given time.'
    );
    s.supplyDemand({ caption: 'Fig 2 — Graph of demand and supply' });
  }
);

add(
  {
    id: 'TE-04',
    split: 'test',
    file: 'TE-04_partially-blank.pdf',
    name: 'Nikhil Prasad',
    roll: 'S-2033',
    profile: 'Ran out of time — Q2 answered properly, Q1 abandoned after two lines, Q3 not started.',
    expected: { q1: 1, q2: 4, q3: 0, total: 5 },
    tests: 'A blank question inside an otherwise answered script must be MISSING on its own points without dragging down the answered ones.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A circuit is a closed path where current flows from the battery through the wires. The switch is used ' +
        'to turn it on and off.'
    );
    s.struck('The ammeter is connected');
    s.note('(diagram not drawn — ran short of time)');
    s.space(30);

    s.heading(Q2);
    s.para(
      'I think the statement is largely true. Finding information has become easy, but understanding it has ' +
        'not become any easier, and those two things get confused.'
    );
    s.para(
      'Technology genuinely helps when a student is trying to understand. If a textbook explanation does not ' +
        'work, a video or a simulation might. My younger brother could not understand fractions from the book ' +
        'at all, but an app that cut a shape into pieces made it obvious to him in one evening.'
    );
    s.para(
      'The problem is that the same access lets a student skip the thinking entirely. If the answer to every ' +
        'homework question is a search away, the homework stops doing its job, which was to make you practise. ' +
        'Someone could argue that this is the student’s fault and not technology’s, and there is something in ' +
        'that, but a tool that makes the shortcut effortless does share the blame.'
    );
    s.para(
      'So I would say technology improves access and only sometimes improves learning, and the difference is ' +
        'whether the student is using it to understand or to finish.'
    );

    s.pageBreak();
    s.heading(Q3);
    s.space(60);
  }
);

add(
  {
    id: 'TE-05',
    split: 'test',
    file: 'TE-05_diagram-heavy.pdf',
    name: 'Tanvi Deshmukh',
    roll: 'S-2040',
    profile:
      'Draws well, writes almost nothing — correct diagrams for Q1 and Q3 with only label-level text, so most explanation points are unsupported.',
    expected: { q1: 2.5, q2: 1, q3: 2, total: 5.5 },
    tests: 'Marks that depend on an explanation should not be awarded from a correct diagram alone; the feedback should say what the writing was missing.',
  },
  (s) => {
    s.heading(Q1);
    s.para('Circuit: battery, switch, resistor, bulb and ammeter in series. Voltmeter in parallel across the bulb.');
    s.circuit({ caption: 'Fig 1 — Series circuit' });
    s.para('V = IR. More resistance, less current.');

    s.pageBreak();
    s.heading(Q2);
    s.para('Technology helps students but also makes them lazy. Both sides are there. It depends on the student.');

    s.heading(Q3);
    s.para('Equilibrium: Rs 30, 60 units. Cost increase shifts S to S1.');
    s.supplyDemand({ caption: 'Fig 2 — Demand and supply', shiftedSupply: true });
  }
);

add(
  {
    id: 'TE-06',
    split: 'test',
    file: 'TE-06_wrong-equilibrium.pdf',
    name: 'Imran Sheikh',
    roll: 'S-2048',
    profile:
      'Sound method, wrong number — reads the equilibrium off the wrong row of the schedule and then reasons correctly from that wrong value.',
    expected: { q1: 4, q2: 4, q3: 2, total: 10 },
    tests: 'The grader has to catch a factual error inside otherwise correct reasoning, and quote the sentence that contains it.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A simple circuit is a closed loop through which current flows. The battery provides the potential ' +
        'difference and the switch completes or breaks the loop. The bulb, resistor, battery, switch and ' +
        'ammeter are connected in series, and the voltmeter is connected in parallel across the bulb because ' +
        'it measures the potential difference across it.'
    );
    s.para(
      'Current flows from the positive terminal of the battery around the external circuit to the negative ' +
        'terminal. When resistance increases the current decreases, since for a fixed voltage the current is ' +
        'inversely proportional to the resistance.'
    );
    s.circuit({ caption: 'Fig 1 — Circuit diagram' });

    s.heading(Q2);
    s.para(
      'Technology has made information much easier to reach, and that has clearly helped students who want to ' +
        'understand something outside class hours. A student can pause a video and replay it, which is not ' +
        'possible with a teacher in a full classroom.'
    );
    s.para(
      'But easy access also encourages copying. If the answer is available immediately, many students will ' +
        'take it and move on without learning anything from the question. Some people argue that this is no ' +
        'different from copying from a friend, which students always did, and that is a fair point, though the ' +
        'scale is much larger now.'
    );
    s.para('Overall I think technology helps students who use it to understand and harms those who use it to finish.');

    s.pageBreak();
    s.heading(Q3);
    s.para(
      'I have plotted the demand and supply schedules with quantity on the horizontal axis and price on the ' +
        'vertical axis. Demand slopes downward and supply slopes upward, as expected.'
    );
    s.para(
      'Reading from the table, the equilibrium is at a price of Rs 40 and a quantity of 40 units, because that ' +
        'is where the quantity demanded settles. At the equilibrium price the market clears and there is no ' +
        'tendency for the price to move.'
    );
    s.para(
      'Below the equilibrium price the quantity demanded exceeds the quantity supplied, which creates a ' +
        'shortage and pushes the price up. Above it the quantity supplied exceeds the quantity demanded, which ' +
        'creates a surplus and pushes the price down.'
    );
    s.para(
      'If production costs rise, producers supply less at each price, so the supply curve shifts to the left ' +
        'and the new equilibrium has a higher price with a lower quantity.'
    );
    s.supplyDemand({
      caption: 'Fig 2 — Demand and supply',
      equilibrium: { price: 40, qty: 40 },
      equilibriumLabel: 'E (Rs 40, 40 units)',
    });
  }
);

add(
  {
    id: 'TE-07',
    split: 'test',
    file: 'TE-07_heavy-scan-noise.pdf',
    name: 'Preeti Nair',
    roll: 'S-2055',
    profile:
      'Worst-case scan — correct answers under heavy character substitution, hyphenated line breaks and a stray scanner artefact line.',
    expected: { q1: 4, q2: 4.5, q3: 4, total: 12.5 },
    tests: 'Stress case for evidence location: quotes must still be matched, and where a quote genuinely cannot be located no box should be drawn.',
  },
  (s) => {
    s.heading(Q1);
    s.para(
      'A slrnple electrlc circult is a clcsed ccnducting path. The batlery gives the pctential diference ' +
        'that drlves the currerit rcund the lccp, and the swltch cpens cr clcses that path.'
    );
    s.para(
      'The batlery, swltch, resistcr, buIb and amrneter are jcined in cne lccp, that is in serles. The ' +
        'amrneter must be in serles as the sarne currerit passes thrcugh every serles ccmpcnent. The ' +
        'vcltrneter is jcined in paralel acrcss the buIb, since it rneasures the pctential diference ' +
        'between the twc erids cf the buIb.'
    );
    s.para(
      'Ccnventicnal currerit rnoves frcm the pcsitive terrninal cf the batlery rcund the externa1 circult ' +
        'and back tc the neqative terrninal. By 0hrn’s law V = lR, sc raislng the resistarice at a flxed ' +
        'vcltage rnust Icwer the currerit.'
    );
    s.circuit({ caption: 'Flg 1 - Clrcult' });
    s.note('|||| scanner edge artefact ||||');

    s.pageBreak();
    s.heading(Q2);
    s.para(
      'Technclcgy has rnade lnfcrrnation far easler tc reach, but reachlng lnfcrrnation is nct the sarne as ' +
        'learnlng frcm it. That distincticn is the whcle statement in rny vlew.'
    );
    s.para(
      'lt helps rncst where repetiticn helps: a student can replay an explanaticn until it larids, cr find a ' +
        'seccnd cne when the flrst dces nct wcrk. Wheri l cculd nct fcllcw prcbability in class, three ' +
        'diferent vidoes gave rne three diferent argles and cne cf therri finaly rnade sense.'
    );
    s.para(
      'The cppcsing case is that instarit answers rernove the strugqle, and strugqle is where understandlng ' +
        'is buiIt. A student whc lccks up every dificult questicn finlshes the wcrk withcut learnlng frcm ' +
        'it. l think this is a real rlsk and nct a srnall cne.'
    );
    s.para(
      'Sc rny ccnclusicn is that technclcgy raises the celling and Icwers the flcor at cnce. lt rewards the ' +
        'student whc wants tc understarid and it excuses the student whc wants tc be flnished.'
    );

    s.heading(Q3);
    s.para(
      'Quantlty is cn the hcrizcnta1 axls and prlce cn the vertlcal axls. Dernand slcpes dcwnward, suply ' +
        'slcpes upward, and they crcss at Rs 3O and 6O units, which is the equilibrlum because quantlty ' +
        'dernanded equals quantlty suplied there.'
    );
    s.para(
      'BeIcw that prlce there is a shcrtaqe and the prlce is bid up; abcve it there is a surpIus and the ' +
        'prlce is cut. A rlse in prcduction ccst shlfts the suply curve tc the Ieft, glving a hlgher prlce ' +
        'and a Icwer quantlty at the new equilibrlum.'
    );
    s.supplyDemand({ caption: 'Flg 2 - Dernand and suply', shiftedSupply: true });
  }
);

/* ---------------------------------------------------------------- RENDER --- */

const manifest = [];
for (const { meta, script } of scripts) {
  const out = path.join(DATASET, meta.split, meta.file);
  await renderScript(script, out);
  manifest.push(meta);
  console.log(`wrote ${path.relative(DATASET, out)}`);
}

fs.writeFileSync(
  path.join(DATASET, 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), scripts: manifest }, null, 2)
);

const csv = [
  'id,split,file,student,roll,expected_q1,expected_q2,expected_q3,expected_total,profile',
  ...manifest.map((m) =>
    [
      m.id,
      m.split,
      m.file,
      m.name,
      m.roll,
      m.expected.q1,
      m.expected.q2,
      m.expected.q3,
      m.expected.total,
      `"${m.profile.replace(/"/g, "'")}"`,
    ].join(',')
  ),
].join('\n');
fs.writeFileSync(path.join(DATASET, 'ground_truth.csv'), csv + '\n');

console.log(`\n${manifest.length} scripts written to ${DATASET}`);
