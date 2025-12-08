# 웹 주소 QR 코드 생성기

웹 주소를 입력하면 해당 주소로 바로 이동할 수 있는 QR 코드를 생성하는 파이썬 GUI 프로그램입니다.

## 기능

- 웹 주소 입력 및 QR 코드 생성
- 생성된 QR 코드 실시간 미리보기
- QR 코드 이미지 파일 저장 기능
- 사용하기 쉬운 직관적인 GUI 인터페이스

## 설치 방법

1. 필요한 라이브러리 설치:
```bash
pip install -r requirements.txt
```

## 사용 방법

1. 프로그램 실행:
```bash
python qr_generator.py
```

2. 웹 주소 입력:
   - 텍스트 필드에 웹 주소를 입력합니다 (예: `www.google.com` 또는 `https://www.google.com`)
   - `http://` 또는 `https://`를 입력하지 않으면 자동으로 `https://`가 추가됩니다

3. QR 코드 생성:
   - "QR 코드 생성" 버튼을 클릭하거나 Enter 키를 누릅니다
   - 생성된 QR 코드가 화면에 표시됩니다

4. QR 코드 저장:
   - "QR 코드 저장" 버튼을 클릭하여 PNG 파일로 저장할 수 있습니다

## 요구사항

- Python 3.7 이상
- qrcode[pil]
- Pillow

## 라이선스

이 프로젝트는 자유롭게 사용할 수 있습니다.

