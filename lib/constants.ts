export const AP_LIST = ["AP Calculus AB","AP Calculus BC","AP Statistics","AP Physics 1","AP Physics 2","AP Physics C: Mech","AP Physics C: E&M","AP Chemistry","AP Biology","AP Environmental Science","AP Computer Science A","AP Computer Science Principles","AP English Language","AP English Literature","AP US History","AP World History","AP European History","AP Government","AP Macroeconomics","AP Microeconomics","AP Psychology","AP Human Geography","AP Art History","AP Spanish","AP Chinese","AP Japanese","AP French","AP Latin","AP Music Theory","AP Studio Art","AP Research","AP Seminar"];

export const UNI_LIST = ["Harvard","MIT","Stanford","Yale","Princeton","UPenn","Caltech","Duke","Johns Hopkins","Northwestern","Cornell","Columbia","UChicago","Rice","Vanderbilt","WashU","Carnegie Mellon","Georgetown","UCLA","UC Berkeley","NYU","UMich","USC","Tufts","Georgia Tech","UIUC","UT Austin","UW Madison","Northeastern","Virginia Tech","Penn State","Purdue","Ohio State","Arizona State","Brown","Dartmouth","Notre Dame","Emory","Wake Forest","UNC Chapel Hill","UVA","Boston University","Boston College","Brandeis","Case Western","Tulane","University of Rochester","Lehigh","RPI","University of Maryland","Rutgers","UConn","University of Pittsburgh","University of Iowa","CU Boulder","University of Oregon","University of Washington","Oregon State","Washington State","Michigan State","Indiana University","Syracuse","GWU","American University","Fordham","Villanova","Santa Clara","Loyola Marymount","Pepperdine","SMU","TCU","Baylor","Texas A&M","University of Georgia","Clemson","Auburn","University of Alabama","University of Tennessee","University of South Carolina","University of Kentucky","University of Arkansas","Ole Miss","University of Nebraska","University of Kansas","Iowa State","Colorado State","University of Vermont","University of Delaware","Drexel","Temple","Stevens Tech","RIT","WPI","Stony Brook","Binghamton","University of Miami","Florida State","UCF","FIU","University of Florida","Embry-Riddle","Georgia State","NC State","Appalachian State","BYU","University of Utah","Gonzaga","Loyola Chicago","DePaul","Marquette","Creighton","University of Denver","University of Tulsa","Chapman","Elon","JMU","George Mason","Babson","Bentley","Pomona","Williams","Amherst","Swarthmore","Bowdoin","Middlebury","Wellesley","Barnard","Smith","Colby","Bates","Hamilton","Wesleyan","Grinnell","Oberlin","Macalester","Carleton","Colorado College","Reed","Kenyon","Denison","University of Richmond","Bucknell","Colgate","Lafayette","Davidson","W&L","Harvey Mudd","Claremont McKenna","Parsons","Pratt","RISD","SVA","SCAD","Art Center","West Point","Naval Academy","UC San Diego","UC Santa Barbara","UC Davis","UC Irvine","UC Santa Cruz","UC Riverside","William & Mary","San Jose State","Cal Poly SLO","San Diego State","Colorado School of Mines","Rose-Hulman","Cooper Union","Olin College","Franklin & Marshall","Gettysburg","Dickinson","Skidmore","Connecticut College","Trinity College","Furman","Rhodes","Sewanee","Centre","Whitman","Lewis & Clark","Willamette","University of San Francisco","University of San Diego","University of the Pacific","Loyola Maryland","Fairfield","Marist","Quinnipiac","Sacred Heart","Hofstra","Adelphi","Pace","SUNY Albany","SUNY Buffalo","CUNY Baruch","CUNY Hunter","New School","Berklee","Juilliard","NYU Tisch","Savannah College of Art","Full Sail","Ringling","CalArts","School of the Art Institute of Chicago"];

// 사용자가 본인 전공을 빠르게 찾을 수 있도록 알파벳 순으로 정렬.
// 예외: "Other (직접 입력)"은 실제 전공이 아닌 fallback 입력 옵션이므로 항상 마지막.
export const MAJOR_LIST = [
  "Accounting", "Aerospace Eng", "AI / Machine Learning", "Architecture", "Art History",
  "Biology", "Biomedical Eng", "Business",
  "Chemical Eng", "Chemistry", "Civil Eng", "Cognitive Science", "Communications", "Computer Science",
  "Data Science",
  "Earth Science", "Economics", "Education", "Electrical Eng", "Engineering", "English", "Environmental Science",
  "Film", "Finance", "Fine Arts",
  "History",
  "Industrial Eng", "International Relations",
  "Journalism",
  "Linguistics",
  "Marketing", "Mathematics", "Mechanical Eng", "Music",
  "Neuroscience", "Nursing",
  "Philosophy", "Physics", "Political Science", "Pre-Law", "Pre-Med", "Psychology", "Public Health",
  "Sociology", "Statistics",
  "Theater",
  "Undecided",
  "Other (직접 입력)",
];

// Major alias map for search
const MAJOR_ALIASES: Record<string, string[]> = {
  "Computer Science": ["CS", "컴공", "컴퓨터공학", "컴퓨터과학", "컴사"],
  "Data Science": ["DS", "데이터사이언스", "데이터과학"],
  "AI / Machine Learning": ["AI", "ML", "인공지능", "머신러닝"],
  "Business": ["경영", "경영학", "Business Administration"],
  "Economics": ["Econ", "경제", "경제학"],
  "Finance": ["금융", "재무"],
  "Marketing": ["마케팅"],
  "Accounting": ["회계", "회계학"],
  "Biology": ["Bio", "생물", "생물학", "생명과학"],
  "Chemistry": ["Chem", "화학"],
  "Physics": ["물리", "물리학"],
  "Mathematics": ["Math", "수학"],
  "Statistics": ["Stats", "통계", "통계학"],
  "Engineering": ["공학", "Eng"],
  "Mechanical Eng": ["ME", "기계공학", "기계"],
  "Electrical Eng": ["EE", "전기공학", "전자공학", "전기전자"],
  "Chemical Eng": ["ChemE", "화학공학", "화공"],
  "Civil Eng": ["CE", "토목공학", "토목"],
  "Aerospace Eng": ["항공우주", "항공공학"],
  "Biomedical Eng": ["BME", "의공학", "생체의공학"],
  "Industrial Eng": ["IE", "산업공학", "산공"],
  "Pre-Med": ["의예과", "프리메드", "Pre-Medicine"],
  "Pre-Law": ["법예과", "프리로", "법학"],
  "Nursing": ["간호", "간호학"],
  "Public Health": ["공중보건", "공공보건"],
  "Psychology": ["Psych", "심리학", "심리"],
  "Sociology": ["사회학"],
  "Political Science": ["PoliSci", "정치학", "정치외교"],
  "International Relations": ["IR", "국제관계", "국제관계학", "국관"],
  "Neuroscience": ["Neuro", "신경과학"],
  "Cognitive Science": ["CogSci", "인지과학"],
  "Linguistics": ["언어학"],
  "English": ["영문학", "영어영문"],
  "History": ["역사", "사학"],
  "Philosophy": ["철학"],
  "Art History": ["미술사"],
  "Architecture": ["건축", "건축학"],
  "Fine Arts": ["미술", "순수미술", "BFA"],
  "Film": ["영화", "영화학", "Cinema"],
  "Music": ["음악", "음대"],
  "Theater": ["연극", "Theatre", "연극학"],
  "Communications": ["커뮤니케이션", "언론", "미디어"],
  "Journalism": ["저널리즘", "신문방송"],
  "Environmental Science": ["환경과학", "환경"],
  "Earth Science": ["지구과학"],
  "Education": ["교육", "교육학"],
  "Undecided": ["미정", "전공미정"],
};

export function majorMatchesQuery(major: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (major.toLowerCase().includes(q)) return true;
  const aliases = MAJOR_ALIASES[major];
  if (aliases && aliases.some(a => a.toLowerCase().includes(q))) return true;
  return false;
}

export const COMMON_APP_PROMPTS = [
  "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story. (650 words)",
  "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience? (650 words)",
  "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome? (650 words)",
  "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you? (650 words)",
  "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others. (650 words)",
  "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more? (650 words)",
  "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design. (650 words)",
];

export const COMMON_APP_PROMPTS_KO = [
  "당신을 정의하는 배경, 정체성, 관심사, 또는 재능이 있다면 그 이야기를 들려주세요.",
  "장애물, 도전, 또는 실패에서 배운 교훈을 이야기해주세요.",
  "신념이나 아이디어에 의문을 제기한 경험을 돌아봐주세요.",
  "감사를 느꼈던 순간과 그것이 당신에게 어떤 영향을 주었는지 말해주세요.",
  "개인적 성장을 이끈 성취, 사건, 또는 깨달음을 이야기해주세요.",
  "완전히 몰입하게 만드는 주제, 아이디어, 또는 개념을 설명해주세요.",
  "자유 주제로 에세이를 작성해주세요.",
];