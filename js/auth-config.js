// 로그인 설정 — 이 파일 한 곳만 바꾸면 된다(생성: data10-00/scripts/apply-auth-kit.mjs, 대문 문구 출처 docs/plan.json).
// 내 Supabase 로 옮길 때: url · anonKey 를 내 프로젝트 값으로, 카카오를 설정하지 않았으면 kakao: false. 안내 = docs/내_깃허브로_옮기기.md
// prefix 는 supabase/auth.sql 의 표 이름 앞부분과 같아야 한다.
window.AUTH_CONFIG = {
  "url": "https://hcmgdztsgjvzcyxyayaj.supabase.co",
  "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbWdkenRzZ2p2emN5eHlheWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzU4ODcsImV4cCI6MjA4NzAxMTg4N30.gznaPzY1l8qDAPsEyYNR9KS7f7VqS3xaw-_2HTSwSZw",
  "prefix": "data1012",
  "kakao": true,
  "idleMinutes": 30,
  "localBypass": true,
  "site": {
    "title": "인증서 갱신 관리",
    "summary": "인증 관리대장 엑셀을 넣으면 만료일에서 거꾸로 갱신 일정을 세워 상태 신호와 간트로 보여 주고, 부서별 알림 메일 초안 · 모델-형식별 인증 이력과 인증서 PDF · 신구 인증서 비교 보고서를 만드는 도구입니다.",
    "course": "현장 데이터 디지털화 전문가과정 · 2차수",
    "features": [
      {
        "name": "상태 신호 대시보드",
        "desc": "만료 · 지연 · 임박 · 배포 필요 · 준비 시작 · 정상 건수와 지금 할 일, 앞으로 12개월 만료를 한 화면에 봅니다."
      },
      {
        "name": "갱신 타임라인",
        "desc": "만료일에서 거꾸로 준비 → 기관 심사 → 피드백 → 발급 일정을 세워 인증별 간트로 그립니다."
      },
      {
        "name": "모델별 이력 · PDF",
        "desc": "모델-형식으로 묶어 지금 · 지난 · 중지된 인증서와 인증서 PDF 를 함께 봅니다."
      },
      {
        "name": "알림 메일 초안",
        "desc": "오늘 연락할 사람을 골라 영업 · 품질 · 개발 부서별 메일 초안을 만듭니다."
      }
    ],
    "steps": [
      "관리대장 넣기",
      "갱신 일정 역산",
      "상태 신호",
      "알림 메일",
      "이력 · PDF 정리",
      "인증서 비교"
    ]
  }
};
