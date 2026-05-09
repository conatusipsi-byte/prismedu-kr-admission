/**
 * 학교 검색 헬퍼 — 클라이언트/서버 양쪽에서 사용.
 * 데이터 의존성 없음. 인덱스든 풀 데이터든 동일한 매칭 로직 적용.
 */

// Alias map for search — covers abbreviations, Korean names, and common nicknames
const ALIASES: Record<string, string[]> = {
  "Princeton": ["프린스턴"],
  "MIT": ["매사추세츠공대", "엠아이티", "Massachusetts Institute of Technology"],
  "Harvard": ["하버드"],
  "Stanford": ["스탠퍼드", "스탠포드"],
  "Yale": ["예일"],
  "UPenn": ["University of Pennsylvania", "Penn", "유펜", "펜실베이니아"],
  "Caltech": ["칼텍", "California Institute of Technology"],
  "Duke": ["듀크"],
  "Brown": ["브라운"],
  "Johns Hopkins": ["JHU", "존스홉킨스", "홉킨스"],
  "Northwestern": ["노스웨스턴"],
  "Columbia": ["컬럼비아"],
  "Cornell": ["코넬"],
  "Dartmouth": ["다트머스"],
  "UChicago": ["University of Chicago", "시카고대", "유시카고"],
  "Rice": ["라이스"],
  "Vanderbilt": ["밴더빌트"],
  "Notre Dame": ["노트르담"],
  "WashU": ["Washington University", "워싱턴대 세인트루이스", "WUSTL"],
  "Georgetown": ["조지타운"],
  "Carnegie Mellon": ["CMU", "카네기멜론", "카네기"],
  "Emory": ["에모리"],
  "UVA": ["University of Virginia", "버지니아대"],
  "UCLA": ["University of California Los Angeles", "유씨엘에이"],
  "NYU": ["New York University", "뉴욕대", "엔와이유"],
  "UMich": ["University of Michigan", "U Mich", "Michigan", "미시간"],
  "UC Berkeley": ["University of California Berkeley", "Berkeley", "버클리", "유씨버클리", "Cal"],
  "UNC": ["University of North Carolina", "노스캐롤라이나"],
  "Tufts": ["터프츠"],
  "USC": ["University of Southern California", "유에스씨", "남가주대"],
  "Boston College": ["BC", "보스턴칼리지"],
  "Georgia Tech": ["조지아텍", "GT", "Georgia Institute of Technology"],
  "Boston U": ["Boston University", "BU", "보스턴대"],
  "UIUC": ["University of Illinois Urbana-Champaign", "일리노이", "일리노이대"],
  "UW Madison": ["University of Wisconsin Madison", "위스콘신"],
  "Northeastern": ["노스이스턴"],
  "Tulane": ["튤레인"],
  "UT Austin": ["University of Texas Austin", "텍사스대", "유티"],
  "UC San Diego": ["UCSD", "유씨에스디"],
  "UC Santa Barbara": ["UCSB", "유씨에스비"],
  "UC Davis": ["유씨데이비스"],
  "UC Irvine": ["UCI", "유씨아이", "어바인"],
  "Virginia Tech": ["VT", "버지니아텍"],
  "U of Washington": ["UW", "워싱턴대", "유더블유"],
  "Penn State": ["펜스테이트", "Pennsylvania State"],
  "Purdue": ["퍼듀"],
  "Texas A&M": ["TAMU", "텍사스에이엠"],
  "Ohio State": ["OSU", "오하이오주립"],
  "Rutgers": ["럿거스"],
  "Michigan State": ["MSU", "미시간주립"],
  "Arizona State": ["ASU", "애리조나주립"],
  "U of Florida": ["UF", "플로리다대"],
  "U of Georgia": ["UGA", "조지아대"],
  "U of Maryland": ["UMD", "메릴랜드"],
  "GWU": ["George Washington University", "조지워싱턴"],
  "RPI": ["Rensselaer", "렌슬러"],
  "Cal Poly SLO": ["Cal Poly", "칼폴리"],
  "Stony Brook": ["스토니브룩", "SUNY Stony Brook"],
  "Williams": ["윌리엄스"],
  "Amherst": ["앰허스트"],
  "Swarthmore": ["스와스모어"],
  "Pomona": ["포모나"],
  "Wellesley": ["웰즐리"],
  "Bowdoin": ["보든"],
  "Middlebury": ["미들버리"],
  "Wake Forest": ["웨이크포레스트"],
  "Brandeis": ["브랜다이스"],
  "Case Western": ["CWRU", "케이스웨스턴"],
  "SMU": ["Southern Methodist", "에스엠유"],
  "Pepperdine": ["페퍼다인"],
  "Clemson": ["클렘슨"],
  "U of Miami": ["마이애미대"],
  "Syracuse": ["시라큐스"],
  "Fordham": ["포드햄"],
  "Indiana U": ["IU", "인디아나"],
  "Iowa State": ["ISU", "아이오와"],
  "UMass Amherst": ["UMass", "유매스"],
  "Florida State": ["FSU", "플로리다주립"],
  "BYU": ["Brigham Young", "브리검영"],
  "U of Pittsburgh": ["Pitt", "피츠버그"],
  "UConn": ["University of Connecticut", "코네티컷"],
  "NC State": ["노스캐롤라이나주립"],
  "CU Boulder": ["University of Colorado Boulder", "콜로라도"],
};

/**
 * Search schools by name, alias, or Korean name.
 * Returns true if the school matches the query.
 */
export function schoolMatchesQuery(school: { n: string }, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (school.n.toLowerCase().includes(q)) return true;
  const aliases = ALIASES[school.n];
  if (aliases && aliases.some(a => a.toLowerCase().includes(q))) return true;
  return false;
}
