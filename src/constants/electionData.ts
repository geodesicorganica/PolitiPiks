import { Timestamp } from 'firebase/firestore';
import { Race, BallotMeasure } from '../types';

const seedRaces: Array<Omit<Race, 'closeAt' | 'electionYear' | 'mode'>> = [
  {
    id: 'race-ga-senate-2026',
    state: 'Georgia',
    office: 'Senate',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    summary: 'A critical battleground state contest. This race could determine control of the Senate. Focusing on voting rights and healthcare.',
    ballotpediaUrl: 'https://ballotpedia.org/United_States_Senate_election_in_Georgia,_2026',
    candidates: [
      { 
        id: 'cand-ossoff', 
        name: 'Jon Ossoff', 
        party: 'Democrat',
        summary: 'Jon Ossoff is the senior U.S. Senator from Georgia, serving since 2021. As an investigative journalist and filmmaker, his platform emphasizes anti-corruption, civil rights, and healthcare accessibility.',
        biography: 'John Jonathan Ossoff was born in Atlanta and educated at Georgetown and the London School of Economics. Before entering politics, he was the CEO of Insight TWI, an investigative documentary film production company. He was elected in a historic 2021 runoff, becoming the first Jewish Senator from Georgia and the youngest member of the Senate at the time.',
        campaignPromises: [
          'Expand Medicaid coverage to all Georgians',
          'Pass the John Lewis Voting Rights Act',
          'Invest in high-speed rail connecting Atlanta to Savannah',
          'Triple the clean energy tax credits for low-income households'
        ],
        keyVotes: [
          { bill: 'Inflation Reduction Act', vote: 'Yea', impact: 'Largest climate investment in US history.', url: 'https://www.congress.gov/bill/117th-congress/house-bill/5376', date: '2022-08-16' },
          { bill: 'Bipartisan Infrastructure Law', vote: 'Yea', impact: 'Secured $11B for GA transit and water.', url: 'https://www.congress.gov/bill/117th-congress/house-bill/3684', date: '2021-11-15' },
          { bill: 'CHIPS and Science Act', vote: 'Yea', impact: 'Boosting semi-conductor manufacturing in the south.', url: 'https://www.congress.gov/bill/117th-congress/house-bill/4346', date: '2022-08-09' },
          { bill: 'Respect for Marriage Act', vote: 'Yea', impact: 'Codified federal protections for same-sex marriage.', url: 'https://www.congress.gov/bill/117th-congress/house-bill/8404', date: '2022-12-13' },
          { bill: 'Bipartisan Safer Communities Act', vote: 'Yea', impact: 'First major gun safety legislation in decades.', url: 'https://www.congress.gov/bill/117th-congress/senate-bill/2938', date: '2022-06-25' },
          { bill: 'PACT Act', vote: 'Yea', impact: 'Expanded healthcare for veterans exposed to toxic burn pits.', url: 'https://www.congress.gov/bill/117th-congress/senate-bill/3373', date: '2022-08-10' },
          { bill: 'Electoral Count Reform Act', vote: 'Yea', impact: 'Modernized the counting of electoral votes post-2020.', url: 'https://www.congress.gov/bill/117th-congress/senate-bill/4573', date: '2022-12-29' },
          { bill: 'Postal Service Reform Act', vote: 'Yea', impact: 'Ensured 6-day delivery and stabilized USPS finances.', url: 'https://www.congress.gov/bill/117th-congress/house-bill/3076', date: '2022-04-06' },
          { bill: 'Dr. Lorna Breen Healthcare Act', vote: 'Yea', impact: 'Funded mental health support for medical professionals.', url: 'https://www.congress.gov/bill/117th-congress/senate-bill/610', date: '2022-03-18' },
          { bill: 'Juneteenth Independence Day Act', vote: 'Yea', impact: 'Established Juneteenth as a federal holiday.', url: 'https://www.congress.gov/bill/117th-congress/senate-bill/475', date: '2021-06-17' },
          { bill: 'Budget Resolution', vote: 'Present', impact: 'Abstained from floor vote.', url: 'https://www.congress.gov', date: '2021-08-11' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Jon_Ossoff',
        websiteUrl: 'https://electjon.com',
        metrics: {
          billsIntroduced: 42,
          billsPassed: 12,
          votingAttendance: 98,
          yearsInOffice: 5,
          topContributionSector: 'Technology'
        },
        pollingHistory: [
          { date: 'Jan', value: 48 },
          { date: 'Feb', value: 48.5 },
          { date: 'Mar', value: 49 },
          { date: 'Apr', value: 49.5 },
          { date: 'May', value: 50.2 }
        ],
        sentimentData: [
          { category: 'Economy', value: 65 },
          { category: 'Housing', value: -30 },
          { category: 'Tech', value: 85 },
          { category: 'Ethics', value: 45 }
        ]
      },
      { 
        id: 'cand-raffen', 
        name: 'Brad Raffensperger', 
        party: 'Republican',
        summary: 'Brad Raffensperger is the current Georgia Secretary of State. He gained national prominence for his defense of the integrity of the 2020 election results.',
        biography: 'Bradford Jay Raffensperger is an American politician, businessman, and civil engineer. A graduate of Western Ontario and Georgia State, he founded Tendon Systems, a specialty contracting and engineering firm. He served in the Georgia House of Representatives before becoming Secretary of State in 2019, where he focused on modernizing election infrastructure and maintaining professional licensing standards.',
        campaignPromises: [
          'National Election Security Standard based on paper ballots',
          'Professional License reciprocity across all 50 states',
          'Small business regulatory sunset clauses',
          'Term limits for federal department heads'
        ],
        keyVotes: [
          { bill: 'Georgia Election Integrity Act', vote: 'Yea', impact: 'Implemented voter ID requirements for absentee ballots.', url: 'https://www.legis.ga.gov', date: '2021-03-25' },
          { bill: 'State Professional Licensing Reform', vote: 'Yea', impact: 'Reduced certification times for technical trades by 40%.', url: 'https://www.legis.ga.gov', date: '2022-04-12' },
          { bill: 'HB 316 (Voting Machine Update)', vote: 'Yea', impact: 'Replaced paperless machines with verifiable paper trails.', url: 'https://www.legis.ga.gov', date: '2019-04-02' },
          { bill: 'Transportation Funding Act', vote: 'Yea', impact: 'Secured long-term funding for GA roads and bridges.', url: 'https://www.legis.ga.gov', date: '2020-05-20' },
          { bill: 'Tax Reform (HB 202)', vote: 'Yea', impact: 'Standardized assessment procedures to protect taxpayers.', url: 'https://www.legis.ga.gov', date: '2021-02-10' },
          { bill: 'Child Welfare Reform', vote: 'Yea', impact: 'Streamlined adoption processes and foster care oversight.', url: 'https://www.legis.ga.gov', date: '2022-03-05' },
          { bill: 'Freedom of Conscience Act', vote: 'Yea', impact: 'Protected religious organizations from state mandates.', url: 'https://www.legis.ga.gov', date: '2021-04-15' },
          { bill: 'SB 85 (Craft Brewery Sales)', vote: 'Yea', impact: 'Modernized GA alcohol laws for small businesses.', url: 'https://www.legis.ga.gov', date: '2020-08-30' },
          { bill: 'Education Transparency Act', vote: 'Yea', impact: 'Required public posting of school funding allocations.', url: 'https://www.legis.ga.gov', date: '2022-02-18' },
          { bill: 'State Sales Tax Limitation', vote: 'Yea', impact: 'Caps state spending based on inflation indices.', url: 'https://www.legis.ga.gov', date: '2023-01-20' },
          { bill: 'Emergency Powers Resolution', vote: 'Nay', impact: 'Voted against extending executive emergency powers.', url: 'https://www.legis.ga.gov', date: '2021-05-10' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Brad_Raffensperger',
        websiteUrl: 'https://bradforgeorgia.com',
        metrics: {
          billsIntroduced: 15,
          billsPassed: 8,
          votingAttendance: 99,
          yearsInOffice: 8,
          topContributionSector: 'Manufacturing'
        },
        pollingHistory: [
          { date: 'Jan', value: 45 },
          { date: 'Feb', value: 45.2 },
          { date: 'Mar', value: 46 },
          { date: 'Apr', value: 46.5 },
          { date: 'May', value: 47.1 }
        ],
        sentimentData: [
          { category: 'Security', value: 80 },
          { category: 'Biz Growth', value: 70 },
          { category: 'Reform', value: -15 },
          { category: 'Audit', value: 90 }
        ]
      },
    ]
  },
  {
    id: 'race-mi-gov-2026',
    state: 'Michigan',
    office: 'Governor',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    summary: 'Open seat with Governor Whitmer term-limited. Key issues: Auto industry transition and education funding.',
    ballotpediaUrl: 'https://ballotpedia.org/Michigan_gubernatorial_election,_2026',
    candidates: [
      { 
        id: 'cand-gilchrist', 
        name: 'Garlin Gilchrist', 
        party: 'Democrat',
        summary: 'Garlin Gilchrist II has served as the 64th Lieutenant Governor of Michigan since 2019. A former software engineer and community organizer, he has focused on criminal justice reform, minority-owned business support, and tech equity.',
        biography: 'Garlin Gilchrist II was born in Detroit and raised in Farmington Hills. A graduate of the University of Michigan, he worked as a software engineer at Microsoft before returning to public service. He served as the first Director of Innovation and Emerging Technology for the City of Detroit, where he spearheaded open data initiatives and digital inclusion programs.',
        campaignPromises: [
          'Federal EV Manufacturing Credits for legacy auto plants',
          'National Right to Broadband access mandate',
          'Clean Energy Jobs training initiative for transitioning workers',
          'Automatic Voter Registration federally'
        ],
        keyVotes: [
          { bill: 'MI Clean Energy & Jobs Act', vote: 'Yea', impact: 'Mandated 100% clean energy by 2040 in Michigan.', url: 'http://legislature.mi.gov' },
          { bill: 'Juvenile Justice Reform Package', vote: 'Yea', impact: 'Reduced incarceration rates for non-violent youth offenses.', url: 'http://legislature.mi.gov' },
          { bill: 'Prop 1 (Transparency Support)', vote: 'Support', impact: 'Enacted stricter financial disclosure for state officials.', url: 'http://legislature.mi.gov' },
          { bill: 'Equity in Contracting Directive', vote: 'Lead', impact: 'Increased state spend with minority businesses by 15%.', url: 'http://legislature.mi.gov' },
          { bill: 'COVID-19 Disparities Task Force', vote: 'Chair', impact: 'Closed the mortality gap for minority residents in MI.', url: 'http://legislature.mi.gov' },
          { bill: 'Joint Task Force on Jail Reform', vote: 'Chair', impact: 'Reduced pretrial detention for low-level crimes.', url: 'http://legislature.mi.gov' },
          { bill: 'Reproductive Freedom Initiative', vote: 'Support', impact: 'Codified abortion access in the MI constitution.', url: 'http://legislature.mi.gov' },
          { bill: 'Voting Rights Prop 2', vote: 'Support', impact: 'Expanded early voting and secure drop-box access.', url: 'http://legislature.mi.gov' },
          { bill: 'Stronger Michigan Families Act', vote: 'Support', impact: 'Doubled the state Earned Income Tax Credit.', url: 'http://legislature.mi.gov' },
          { bill: 'Healthcare Access Directive', vote: 'Lead', impact: 'Extended postpartum Medicaid coverage to 12 months.', url: 'http://legislature.mi.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Garlin_Gilchrist',
        websiteUrl: 'https://garlinforgov.com',
        metrics: {
          billsIntroduced: 28,
          billsPassed: 5,
          votingAttendance: 95,
          yearsInOffice: 7,
          topContributionSector: 'Education'
        },
        pollingHistory: [
          { date: 'Jan', value: 44 },
          { date: 'Feb', value: 45 },
          { date: 'Mar', value: 46 },
          { date: 'Apr', value: 47 },
          { date: 'May', value: 48.5 }
        ],
        sentimentData: [
          { category: 'Justice', value: 85 },
          { category: 'Tech', value: 90 },
          { category: 'Auto', value: 65 },
          { category: 'Budget', value: -25 }
        ]
      },
      { 
        id: 'cand-james', 
        name: 'John James', 
        party: 'Republican',
        summary: 'John James is a U.S. Representative and former combat pilot who served in the Iraq War. As a businessman in the automotive logistics sector, he champions deregulation, border security, and vocational training.',
        biography: 'John Edward James graduated from West Point in 2004 and served as an Apache pilot in the US Army. After his service, he joined his family\'s logistics business, James Group International, where he served as President. He was elected to represent Michigan\'s 10th district in 2022, bringing a veteran\'s perspective to the House Committee on Foreign Affairs.',
        campaignPromises: [
          'Federal tax credits for military-to-civilian job placements',
          'Energy Independence via nuclear and natural gas expansion',
          'Strengthening the Great Lakes workforce for industrial shipping',
          'Zero-based budgeting for federal agencies'
        ],
        keyVotes: [
          { bill: 'Border Security and Enforcement Act', vote: 'Yea', impact: 'Authorized $2B for physical barriers and technology.', url: 'https://www.congress.gov' },
          { bill: 'Strategic Competition Act', vote: 'Yea', impact: 'Counterbalancing global supply chain dependencies.', url: 'https://www.congress.gov' },
          { bill: 'Parental Rights in Education', vote: 'Yea', impact: 'Expanded parent oversight in federal school curricula.', url: 'https://www.congress.gov' },
          { bill: 'Lower Energy Costs Act', vote: 'Yea', impact: 'Fast-tracked domestic oil and gas permit approvals.', url: 'https://www.congress.gov' },
          { bill: 'DETERRENT Act', vote: 'Yea', impact: 'Disclosed foreign funding in US higher education.', url: 'https://www.congress.gov' },
          { bill: 'REIN IN Act', vote: 'Yea', impact: 'Mandated analysis of executive orders on inflation.', url: 'https://www.congress.gov' },
          { bill: 'Protecting Speech on Campus', vote: 'Yea', impact: 'Restricted federal funds for schools suppressing speech.', url: 'https://www.congress.gov' },
          { bill: 'American Confidence in Elections', vote: 'Yea', impact: 'Standardized voter ID requirements for federal races.', url: 'https://www.congress.gov' },
          { bill: 'Supporting Our Seniors Act', vote: 'Yea', impact: 'Protected Social Security from administrative cuts.', url: 'https://www.congress.gov' },
          { bill: 'Water Resources Development', vote: 'Yea', impact: 'Funded major Great Lakes infrastructure repairs.', url: 'https://www.congress.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/John_James',
        websiteUrl: 'https://johnjamesmi.com',
        metrics: {
          billsIntroduced: 18,
          billsPassed: 3,
          votingAttendance: 97,
          yearsInOffice: 3,
          topContributionSector: 'Automotive'
        },
        pollingHistory: [
          { date: 'Jan', value: 47 },
          { date: 'Feb', value: 47.1 },
          { date: 'Mar', value: 47 },
          { date: 'Apr', value: 46.5 },
          { date: 'May', value: 46.2 }
        ],
        sentimentData: [
          { category: 'Security', value: 80 },
          { category: 'Biz Growth', value: 70 },
          { category: 'Reform', value: -15 },
          { category: 'Audit', value: 90 }
        ]
      },
    ]
  },
  {
    id: 'race-tx-senate-2026',
    state: 'Texas',
    office: 'Senate',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    summary: 'Senior incumbent Senator John Cornyn faces a strong challenge as the state demographics continue to shift.',
    ballotpediaUrl: 'https://ballotpedia.org/United_States_Senate_election_in_Texas,_2026',
    candidates: [
      { 
        id: 'cand-cornyn', 
        name: 'John Cornyn', 
        party: 'Republican',
        summary: 'John Cornyn has represented Texas in the U.S. Senate since 2002. A former Associate Justice of the Texas Supreme Court and Attorney General of Texas, he is a senior member of the Judiciary and Finance Committees.',
        biography: 'John Cornyn was born in Houston and educated at Trinity University and St. Mary\'s Law. He has spent over three decades in public service, rising from a district judge to a two-term Senate Majority Whip. He is known for his role in judicial nominations and his advocacy for the Texas energy sector on the world stage.',
        campaignPromises: [
          'Protecting domestic oil and gas production from federal bans',
          'Strengthening US-Mexico-Canada trade relations (USMCA 2.0)',
          'Federal support for high-tech manufacturing in Texas "Silicon Hills"',
          'Constitutional Amendment to limit federal spending'
        ],
        keyVotes: [
          { bill: 'Tax Cuts and Jobs Act', vote: 'Yea', impact: 'Lowered corporate rates to 21% boosting capital investment.', url: 'https://www.congress.gov' },
          { bill: 'Safe Communities Act', vote: 'Yea', impact: 'Standardized background checks for younger buyers.', url: 'https://www.congress.gov' },
          { bill: 'First Step Act', vote: 'Yea', impact: 'Major criminal justice reform for non-violent offenders.', url: 'https://www.congress.gov' },
          { bill: 'USMCA Trade Agreement', vote: 'Yea', impact: 'Updated NAFTA with stronger digital and auto rules.', url: 'https://www.congress.gov' },
          { bill: 'FIX NICS Act', vote: 'Yea', impact: 'Strengthened reporting to the background check system.', url: 'https://www.congress.gov' },
          { bill: 'Justice for Trafficking Victims', vote: 'Yea', impact: 'Created a fund to support human trafficking survivors.', url: 'https://www.congress.gov' },
          { bill: 'FOIA Improvement Act', vote: 'Yea', impact: 'Mandated a "presumption of openness" for public records.', url: 'https://www.congress.gov' },
          { bill: 'Every Student Succeeds Act', vote: 'Yea', impact: 'Returned education control to states and local districts.', url: 'https://www.congress.gov' },
          { bill: 'Opioid Crisis Response Act', vote: 'Yea', impact: 'Expanded recovery support and non-opioid pain research.', url: 'https://www.congress.gov' },
          { bill: 'Cyber-Sharing Act', vote: 'Yea', impact: 'Encouraged real-time sharing of threat data.', url: 'https://www.congress.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/John_Cornyn',
        websiteUrl: 'https://johncornyn.com',
        metrics: {
          billsIntroduced: 85,
          billsPassed: 24,
          votingAttendance: 98,
          yearsInOffice: 24,
          topContributionSector: 'Energy'
        },
        pollingHistory: [
          { date: 'Jan', value: 52 },
          { date: 'Feb', value: 51.5 },
          { date: 'Mar', value: 51 },
          { date: 'Apr', value: 50 },
          { date: 'May', value: 49.8 }
        ],
        sentimentData: [
          { category: 'Energy', value: 85 },
          { category: 'Trade', value: 60 },
          { category: 'Spending', value: -40 },
          { category: 'Judicial', value: 75 }
        ]
      },
      { 
        id: 'cand-castro', 
        name: 'Joaquín Castro', 
        party: 'Democrat',
        summary: 'Joaquín Castro represents Texas\' 20th Congressional District. A graduate of Stanford and Harvard Law, he has been a prominent voice on the House Foreign Affairs Committee.',
        biography: 'Joaquín Castro was born in San Antonio and is a second-generation American of Mexican descent. He served in the Texas House of Representatives for ten years before being elected to Congress in 2012. He is a past chair of the Congressional Hispanic Caucus and a leading advocate for civil rights and humanitarian immigration policies.',
        campaignPromises: [
          'A path to citizenship for DACA and Essential Workers',
          'Lowering prescription drug costs via federal price negotiation',
          'Expanding solar and wind subsidies for rural Texas ranching',
          'Voting rights protection for historically marginalized areas'
        ],
        keyVotes: [
          { bill: 'American Rescue Plan', vote: 'Yea', impact: 'Provided stimulus and public health funding during global crisis.', url: 'https://www.congress.gov' },
          { bill: 'Dream and Promise Act', vote: 'Yea', impact: 'Passed the House to provide legal status for DACA recipients.', url: 'https://www.congress.gov' },
          { bill: 'Build Back Better Act', vote: 'Yea', impact: 'Historic investment in social safety nets and climate.', url: 'https://www.congress.gov' },
          { bill: 'Justice in Policing Act', vote: 'Yea', impact: 'Proposed national standards for police accountability.', url: 'https://www.congress.gov' },
          { bill: 'For the People Act', vote: 'Yea', impact: 'Comprehensive voting rights and ethics reform bill.', url: 'https://www.congress.gov' },
          { bill: 'RAISE Act (Refugees)', vote: 'Yea', impact: 'Increased federal annual cap for refugee admissions.', url: 'https://www.congress.gov' },
          { bill: 'PRO Act', vote: 'Yea', impact: 'Strengthened federal protections for union organizing.', url: 'https://www.congress.gov' },
          { bill: 'Equality Act', vote: 'Yea', impact: 'Prohibited discrimination based on gender and orientation.', url: 'https://www.congress.gov' },
          { bill: 'Violence Against Women Act', vote: 'Yea', impact: 'Reauthorized tribal and federal domestic violence grants.', url: 'https://www.congress.gov' },
          { bill: 'Global Health Security Act', vote: 'Yea', impact: 'Institutionalized US leadership in pandemic prevention.', url: 'https://www.congress.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Joaquin_Castro',
        websiteUrl: 'https://castrofortexas.com',
        metrics: {
          billsIntroduced: 55,
          billsPassed: 9,
          votingAttendance: 96,
          yearsInOffice: 13,
          topContributionSector: 'Legal'
        },
        pollingHistory: [
          { date: 'Jan', value: 40 },
          { date: 'Feb', value: 42 },
          { date: 'Mar', value: 43 },
          { date: 'Apr', value: 44.5 },
          { date: 'May', value: 46.1 }
        ],
        sentimentData: [
          { category: 'Immigration', value: 70 },
          { category: 'Healthcare', value: 85 },
          { category: 'Education', value: 80 },
          { category: 'Civil Rights', value: 90 }
        ]
      },
    ]
  },
  {
    id: 'race-ca-house-2026',
    state: 'California',
    office: 'House',
    district: '47',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    summary: 'A high-profile House seat in Orange County. Key indicator for suburban swing districts.',
    ballotpediaUrl: 'https://ballotpedia.org/California%27s_47th_Congressional_District_election,_2026',
    candidates: [
      {
        id: 'cand-min',
        name: 'Dave Min',
        party: 'Democrat',
        summary: 'Dave Min is a State Senator and law professor specializing in economic policy. His platform focuses on climate action, gun safety, and making healthcare more affordable for middle-class families.',
        biography: 'Dave Min is the child of Korean immigrants and was educated at UPenn and Harvard Law. Before his election to the State Senate, he was a law professor at UC Irvine and a former enforcement attorney for the SEC. He has been a champion for domestic violence prevention and consumer protection laws.',
        campaignPromises: [
          'Closing the "Gun Show Loophole" at the federal level',
          'Federal Student Loan forgiveness for public sector workers',
          'Coastal protection and offshore drilling bans',
          'Strengthening antitrust enforcement in California tech sectors'
        ],
        keyVotes: [
          { bill: 'California Dream Act', vote: 'Yea', impact: 'Expanded financial aid to non-resident students.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'AB 1201 (Gun Safety)', vote: 'Yea', impact: 'Regulated ghost guns and restricted large-capacity magazines.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Later School Starts Act', vote: 'Yea', impact: 'Mandated 8:30am starts for high schools statewide.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'OC Fair Gun Sales Ban', vote: 'Author', impact: 'Eliminated firearm transactions on state-owned property.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Domestic Violence Reform', vote: 'Yea', impact: 'Broadened definitions and protection order durations.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Junk Fees Ban (SB 478)', vote: 'Yea', impact: 'Required all-in pricing transparency for consumers.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Concealed Carry Specs (SB 2)', vote: 'Yea', impact: 'Standardized training and sensitive zone restrictions.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Faith-based Housing Act', vote: 'Yea', impact: 'Allowed streamlining for low-income housing on church lands.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Corporate Climate Disclosue', vote: 'Yea', impact: 'Mandated Scope 3 emission reporting for large firms.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Human Trafficking Felony', vote: 'Yea', impact: 'Classified minor sex trafficking as a serious felony.', url: 'https://leginfo.legislature.ca.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Dave_Min',
        websiteUrl: 'https://davemin.com',
        metrics: {
          billsIntroduced: 25,
          billsPassed: 7,
          votingAttendance: 99,
          yearsInOffice: 6,
          topContributionSector: 'Environment'
        },
        pollingHistory: [
          { date: 'Mar', value: 46 },
          { date: 'Apr', value: 47 },
          { date: 'May', value: 48 }
        ],
        sentimentData: [
          { category: 'Housing', value: -40 },
          { category: 'Education', value: 85 },
          { category: 'Climate', value: 90 },
          { category: 'Tech', value: 75 }
        ]
      },
      {
        id: 'cand-baugh',
        name: 'Scott Baugh',
        party: 'Republican',
        summary: 'Scott Baugh is a former State Assembly member and GOP chairman. He emphasizes tax reduction, deregulation, and property rights as the core of his legislative agenda.',
        biography: 'Scott Baugh served as the Republican Leader in the California State Assembly from 1999 to 2001. A lawyer by trade, he specializes in property rights and corporate law. He has been a fixture in Orange County politics for over two decades, serving as the chairman of the Republican Party of Orange County for ten years.',
        campaignPromises: [
          'Reducing personal income tax rates for high-cost-of-living areas',
          'Streamlining federal environmental reviews for housing (NEPA reform)',
          'Protecting single-family zoning and local control',
          'Mandatory fiscal audits for all federal spending in California'
        ],
        keyVotes: [
          { bill: 'Public Safety Reform (CA Assembly)', vote: 'Nay', impact: 'Opposed early release programs for non-violent offenders.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Small Business Regulatory Act', vote: 'Yea', impact: 'Sponsored legislation to exempt small firms from certain mandates.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Electricity Deregulation', vote: 'Yea', impact: 'Supported market-based competition for state utilities.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Education Accountability', vote: 'Yea', impact: 'Linked school block grants to performance testing.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Welfare Fraud Reform', vote: 'Yea', impact: 'Increased eligibility verification for public assistance.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Taxpayer Protection Initiative', vote: 'Support', impact: 'Required 2/3 majority for all local tax increases.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Prop 13 Defense', vote: 'Support', impact: 'Maintained property tax caps for homeowners and biz.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'State Spending Limit', vote: 'Support', impact: 'Proposed capping state budget growth to GDP metrics.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Mandatory Fiscal Audits', vote: 'Support', impact: 'Called for independent review of all special funds.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Local Zoning Control', vote: 'Support', impact: 'Opposed state-level override of local housing plans.', url: 'https://leginfo.legislature.ca.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Scott_Baugh',
        websiteUrl: 'https://baughforcongress.com',
        metrics: {
          billsIntroduced: 12,
          billsPassed: 4,
          votingAttendance: 94,
          yearsInOffice: 8,
          topContributionSector: 'Real Estate'
        },
        pollingHistory: [
          { date: 'Mar', value: 45 },
          { date: 'Apr', value: 45.5 },
          { date: 'May', value: 46 }
        ],
        sentimentData: [
          { category: 'Taxes', value: 82 },
          { category: 'Property', value: 70 },
          { category: 'Gov reach', value: -55 },
          { category: 'Safety', value: 78 }
        ]
      }
    ]
  },
  {
    id: 'race-usa-president-2028',
    state: 'National',
    office: 'President',
    status: 'upcoming',
    closeDate: '2028-11-07T20:00:00Z',
    summary: 'Future-Cycle Predictive Analysis for the 2028 Presidential contest. Early metrics focus on favorability and legislative track records.',
    ballotpediaUrl: 'https://ballotpedia.org/Presidential_election,_2028',
    candidates: [
      {
        id: 'cand-newsom',
        name: 'Gavin Newsom',
        party: 'Democrat',
        summary: 'Gavin Newsom is the 40th Governor of California. His platform centers on progressive state-level successes in climate, digital privacy, and universal healthcare as models for federal policy.',
        biography: 'Gavin Christopher Newsom served as the 42nd Lieutenant Governor of California and the 42nd Mayor of San Francisco. A graduate of Santa Clara University, he co-founded the PlumpJack Group. He is known for his early advocacy for same-sex marriage and has led California through multiple climate and public health crises.',
        campaignPromises: [
          'Federal "Right to Safety" Constitutional Amendment for Gun Control',
          'Universal Early Childhood Education nationwide',
          'National Digital Privacy Bill of Rights',
          'Climate Resilience infrastructure bank'
        ],
        keyVotes: [
          { bill: 'CARE Court Act (CA)', vote: 'Yea', impact: 'Mandatory treatment for severe mental health issues.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Fast Food Accountability Act', vote: 'Yea', impact: 'Raised minimum wage for fast food workers to $20/hr.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Global Warming Solution Act', vote: 'Yea', impact: 'Mandated carbon neutrality by 2045 in California.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Reproductive Freedom Amend', vote: 'Yea', impact: 'Explicitly protected abortion in the CA constitution.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Gun Safety SJR 7', vote: 'Support', impact: 'Called for a US Constitutional Convention on guns.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Universal School Meals', vote: 'Lead', impact: 'Provided free breakfast/lunch for all students regardless of income.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Mental Health Reform', vote: 'Yea', impact: 'Shifted $6B to state-level treatment and housing.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'EV Mandate Executive Order', vote: 'Lead', impact: 'Required 100% of new car sales to be zero-emission by 2035.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Digital Privacy CCPA', vote: 'Yea', impact: 'Granted users the right to delete personal data from tech firms.', url: 'https://leginfo.legislature.ca.gov' },
          { bill: 'Healthcare for All Initiative', vote: 'Lead', impact: 'Expanded Medi-Cal coverage to all residents regardless of status.', url: 'https://leginfo.legislature.ca.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Gavin_Newsom',
        websiteUrl: 'https://gavinnewsom.com',
        metrics: {
          billsIntroduced: 120,
          billsPassed: 95,
          votingAttendance: 100,
          yearsInOffice: 16,
          topContributionSector: 'Diversified'
        },
        pollingHistory: [
          { date: 'Q1', value: 38 },
          { date: 'Q2', value: 42 }
        ],
        sentimentData: [
          { category: 'Climate', value: 92 },
          { category: 'Health', value: 78 },
          { category: 'Digital', value: 85 },
          { category: 'Taxation', value: -45 }
        ]
      },
      {
        id: 'cand-desantis',
        name: 'Ron DeSantis',
        party: 'Republican',
        summary: 'Ron DeSantis is the 46th Governor of Florida. His "Florida Blueprint" emphasizes school choice, fiscal conservatism, and challenging federal regulatory reach.',
        biography: 'Ronald Dion DeSantis is an American politician who has served as the Governor of Florida since 2019. A graduate of Yale and Harvard Law, he served as a JAG officer in the US Navy. He represented Florida\'s 6th district in Congress before becoming Governor, where he gained national attention for his policies regarding public health, education, and social issues.',
        campaignPromises: [
          'National School Choice scholarship mandate',
          'Ending "Ideological Procurement" in federal contracting',
          'Structural reform of the Department of Education',
          'Aggressive reduction in federal agency staffing levels'
        ],
        keyVotes: [
          { bill: 'Parental Rights in Education (FL)', vote: 'Yea', impact: 'Restricted discussion of gender and orientation in young grades.', url: 'https://www.flsenate.gov' },
          { bill: 'Heartbeat Protection Act (FL)', vote: 'Yea', impact: 'Implemented a 6-week limitation on reproductive health procedures.', url: 'https://www.flsenate.gov' },
          { bill: 'Freedom First Budget', vote: 'Yea', impact: 'Allocated record $1B for environmental protection.', url: 'https://www.flsenate.gov' },
          { bill: 'Keep Florida Free Act', vote: 'Yea', impact: 'Prohibited vaccine mandates for private sector workers.', url: 'https://www.flsenate.gov' },
          { bill: 'Wildlife Corridor Act', vote: 'Yea', impact: 'Protected 18M acres of wildlife land from development.', url: 'https://www.flsenate.gov' },
          { bill: 'Combatting Violence HB 1', vote: 'Yea', impact: 'Increased penalties for property damage during protests.', url: 'https://www.flsenate.gov' },
          { bill: 'Permanent Tax Relief', vote: 'Yea', impact: 'Executed $2B in sales tax holidays for families.', url: 'https://www.flsenate.gov' },
          { bill: 'Stop WOKE Act', vote: 'Yea', impact: 'Restricted diversity training in state agencies and schools.', url: 'https://www.flsenate.gov' },
          { bill: 'Elections Integrity Unit', vote: 'Lead', impact: 'Created a dedicated state force for voter fraud crimes.', url: 'https://www.flsenate.gov' },
          { bill: 'Civics Literacy Initiative', vote: 'Lead', impact: 'Mandated US Constitution exams for high school graduation.', url: 'https://www.flsenate.gov' }
        ],
        ballotpediaUrl: 'https://ballotpedia.org/Ron_DeSantis',
        websiteUrl: 'https://rondesantis.com',
        metrics: {
          billsIntroduced: 200,
          billsPassed: 180,
          votingAttendance: 100,
          yearsInOffice: 12,
          topContributionSector: 'Construction'
        },
        pollingHistory: [
          { date: 'Q1', value: 35 },
          { date: 'Q2', value: 40 }
        ],
        sentimentData: [
          { category: 'Education', value: 88 },
          { category: 'Budget', value: 75 },
          { category: 'Federal', value: -60 },
          { category: 'Law', value: 82 }
        ]
      }
    ]
  }
];

const seedMeasures: Array<Omit<BallotMeasure, 'closeAt' | 'electionYear' | 'mode'>> = [
  {
    id: 'measure-fl-legalize-2026',
    state: 'Florida',
    title: 'Amendment 3: Adult Personal Use of Marijuana',
    description: 'Allows adults 21 years or older to possess, purchase, or use marijuana products and marijuana accessories for non-medical personal consumption.',
    status: 'upcoming',
    closeDate: '2026-11-03T19:00:00Z',
    category: 'Presidential',
    history: 'Florida has a long history of ballot initiatives regarding drug policy. In 2016, voters approved medical marijuana with over 70% support. This amendment follows several years of signature gathering by the "Smart & Safe Florida" campaign, which secured over 1 million verified signatures to place it on the 2026 ballot.',
    overview: 'This measure would legalize the recreational use of marijuana for adults. Current law only permits medical use with a registry card. If passed, Florida would join over 20 other states in full legalization. The amendment requires a 60% supermajority to pass under Florida law.',
    impactMetrics: [
      { label: 'Tax Revenue (Est)', current: 0, projected: 195000000 },
      { label: 'Law Enforcement', current: 15000000, projected: 2000000 },
      { label: 'Market Value $', current: 2, projected: 6 }
    ],
    ballotpediaUrl: 'https://ballotpedia.org/Florida_Amendment_3,_Adult_Personal_Use_of_Marijuana_Initiative_(2026)'
  },
  {
    id: 'measure-ca-climate-2026',
    state: 'California',
    title: 'Proposition 4: Climate Change Mitigation Bond',
    description: 'Authorizes $10 billion in general obligation bonds for water, wildfire prevention, and climate change adaptation projects.',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    category: 'Presidential',
    history: 'Derived from record-setting drought and wildfire seasons in the early 2020s, legislation was introduced to provide a permanent funding mechanism for resilience. This bond follows the 2018 Proposition 68, which focused on similar natural resource protection.',
    overview: 'The bond funds would be allocated as follows: $3.8B for safe drinking water and drought resilience, $1.5B for wildfire prevention, and $1.2B for coastal protection. Critics argue it increases state debt, while supporters emphasize the rising costs of disaster recovery without proactive investment.',
    impactMetrics: [
      { label: 'Jobs Created', current: 0, projected: 45000 },
      { label: 'Acres Protected', current: 120000, projected: 500000 },
      { label: 'Debt Payment $', current: 0, projected: 400000000 }
    ],
    ballotpediaUrl: 'https://ballotpedia.org/California_Proposition_4,_Climate_Change_Mitigation_Bond_Initiative_(2026)'
  }
];

/** Test-only legacy fixture data. It is never imported by production surfaces. */
export const SEED_RACES: Race[] = seedRaces.map((race) => ({
  ...race,
  closeAt: Timestamp.fromDate(new Date(race.closeDate)),
  electionYear: race.closeDate.startsWith('2028') ? 2028 : 2026,
  mode: race.closeDate.startsWith('2028') ? 'sandbox' : 'live',
}));

export const SEED_MEASURES: BallotMeasure[] = seedMeasures.map((measure) => ({
  ...measure,
  closeAt: Timestamp.fromDate(new Date(measure.closeDate)),
  electionYear: 2026,
  mode: 'live',
}));
