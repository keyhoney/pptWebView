import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import qrcode
from PIL import Image, ImageTk
import io
import os
from datetime import datetime
from urllib.parse import urlparse


class QRCodeGenerator:
    def __init__(self, root):
        self.root = root
        self.root.title("QR 코드 생성기")
        self.root.geometry("500x600")
        self.root.resizable(False, False)
        
        # QR 코드 이미지를 저장할 변수
        self.qr_image = None
        self.qr_photo = None
        
        self.create_widgets()
    
    def create_widgets(self):
        # 제목 레이블
        title_label = tk.Label(
            self.root,
            text="웹 주소 QR 코드 생성기",
            font=("맑은 고딕", 18, "bold"),
            pady=20
        )
        title_label.pack()
        
        # URL 입력 프레임
        input_frame = tk.Frame(self.root, pady=20)
        input_frame.pack(fill=tk.X, padx=20)
        
        url_label = tk.Label(
            input_frame,
            text="웹 주소 입력:",
            font=("맑은 고딕", 10)
        )
        url_label.pack(anchor=tk.W)
        
        self.url_entry = tk.Entry(
            input_frame,
            font=("맑은 고딕", 11),
            width=50
        )
        self.url_entry.pack(fill=tk.X, pady=(5, 0))
        self.url_entry.bind("<Return>", lambda e: self.generate_qr())
        
        # 생성 버튼
        generate_button = tk.Button(
            input_frame,
            text="QR 코드 생성",
            command=self.generate_qr,
            font=("맑은 고딕", 11, "bold"),
            bg="#4CAF50",
            fg="white",
            relief=tk.RAISED,
            padx=20,
            pady=10,
            cursor="hand2"
        )
        generate_button.pack(pady=15)
        
        # QR 코드 표시 프레임
        qr_frame = tk.Frame(self.root, bg="white", relief=tk.SUNKEN, bd=2)
        qr_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=(0, 20))
        
        self.qr_label = tk.Label(
            qr_frame,
            text="QR 코드가 여기에 표시됩니다",
            font=("맑은 고딕", 10),
            bg="white",
            fg="gray"
        )
        self.qr_label.pack(expand=True)
        
        # 저장 버튼 프레임
        save_frame = tk.Frame(self.root, pady=10)
        save_frame.pack()
        
        save_button = tk.Button(
            save_frame,
            text="QR 코드 저장",
            command=self.save_qr_code,
            font=("맑은 고딕", 10),
            bg="#2196F3",
            fg="white",
            relief=tk.RAISED,
            padx=15,
            pady=8,
            cursor="hand2",
            state=tk.DISABLED
        )
        save_button.pack()
        self.save_button = save_button
    
    def generate_qr(self):
        url = self.url_entry.get().strip()
        
        # URL 유효성 검사
        if not url:
            messagebox.showwarning("경고", "웹 주소를 입력해주세요.")
            return
        
        # http:// 또는 https://가 없으면 추가
        original_url = url
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        
        try:
            # QR 코드 생성
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(url)
            qr.make(fit=True)
            
            # QR 코드 이미지 생성 (저장용 원본)
            qr_image_full = qr.make_image(fill_color="black", back_color="white")
            
            # 이미지 크기 조정 (표시용)
            display_size = 300
            self.qr_image = qr_image_full.copy()
            self.qr_image.thumbnail((display_size, display_size), Image.Resampling.LANCZOS)
            
            # Tkinter에서 사용할 수 있도록 변환
            self.qr_photo = ImageTk.PhotoImage(self.qr_image)
            
            # 레이블에 이미지 표시
            self.qr_label.config(image=self.qr_photo, text="")
            
            # 저장 버튼 활성화
            self.save_button.config(state=tk.NORMAL)
            
            # 자동으로 파일 저장
            saved_path = self.auto_save_qr_code(qr_image_full, url)
            
            if saved_path:
                messagebox.showinfo("성공", f"QR 코드가 생성되고 저장되었습니다!\n\n저장 위치:\n{saved_path}")
            else:
                messagebox.showinfo("성공", "QR 코드가 생성되었습니다!")
            
        except Exception as e:
            messagebox.showerror("오류", f"QR 코드 생성 중 오류가 발생했습니다:\n{str(e)}")
    
    def auto_save_qr_code(self, img, url):
        """QR 코드를 자동으로 로컬에 저장"""
        try:
            # qr_codes 폴더 생성 (없으면)
            save_dir = "qr_codes"
            if not os.path.exists(save_dir):
                os.makedirs(save_dir)
            
            # 파일명 생성 (URL에서 도메인 추출 또는 타임스탬프 사용)
            try:
                parsed_url = urlparse(url)
                domain = parsed_url.netloc.replace("www.", "")
                # 파일명에 사용할 수 없는 문자 제거
                domain = "".join(c for c in domain if c.isalnum() or c in ".-_")
                if not domain:
                    domain = "qrcode"
            except:
                domain = "qrcode"
            
            # 타임스탬프 추가 (중복 방지)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{domain}_{timestamp}.png"
            filepath = os.path.join(save_dir, filename)
            
            # 파일 저장
            img.save(filepath)
            return os.path.abspath(filepath)
            
        except Exception as e:
            print(f"자동 저장 중 오류: {str(e)}")
            return None
    
    def save_qr_code(self):
        if self.qr_image is None:
            messagebox.showwarning("경고", "먼저 QR 코드를 생성해주세요.")
            return
        
        # 원본 크기로 다시 생성 (저장용)
        url = self.url_entry.get().strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            
            # 파일 저장 대화상자
            filename = filedialog.asksaveasfilename(
                defaultextension=".png",
                filetypes=[("PNG 파일", "*.png"), ("모든 파일", "*.*")],
                title="QR 코드 저장"
            )
            
            if filename:
                img.save(filename)
                messagebox.showinfo("성공", f"QR 코드가 저장되었습니다:\n{filename}")
        
        except Exception as e:
            messagebox.showerror("오류", f"QR 코드 저장 중 오류가 발생했습니다:\n{str(e)}")


def main():
    root = tk.Tk()
    app = QRCodeGenerator(root)
    root.mainloop()


if __name__ == "__main__":
    main()

