import json

def update_locale(filepath, updates):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for k, v in updates.items():
        if k not in data:
            data[k] = v

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def main():
    en_updates = {
        "actionDisabledAnalysis": "Disabled during analysis",
        "actionDisabledImporting": "Disabled while importing",
        "saveProjectDisabledNoResult": "Nothing to save yet",
        "startAnalysisDisabledNoAudio": "Choose or import audio first",
        "importYoutubeDisabledEmpty": "Enter a valid YouTube URL first"
    }

    ko_updates = {
        "actionDisabledAnalysis": "분석 중에는 비활성화됩니다",
        "actionDisabledImporting": "가져오는 중에는 비활성화됩니다",
        "saveProjectDisabledNoResult": "아직 저장할 프로젝트가 없습니다",
        "startAnalysisDisabledNoAudio": "먼저 오디오를 선택하거나 가져오세요",
        "importYoutubeDisabledEmpty": "먼저 유효한 유튜브 URL을 입력하세요"
    }

    update_locale("apps/desktop/src/locales/en/common.json", en_updates)
    update_locale("apps/desktop/src/locales/ko/common.json", ko_updates)

if __name__ == "__main__":
    main()
