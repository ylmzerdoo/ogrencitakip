<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FENOMENAL Fen Bilimleri</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    
    <!-- Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    
    <!-- SheetJS (Excel) -->
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
    
    <!-- jsPDF -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
    
    <!-- Mammoth.js (Word → text) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
</head>
<body>

    <!-- ==================== AUTH SCREEN ==================== -->
    <div id="auth-screen" class="auth-container">
        <div class="auth-card">
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-size:28px; margin-bottom:4px;">🔬</div>
                <h2 style="font-size:18px; font-weight:600; color:#f8fafc;">FENOMENAL</h2>
                <p style="font-size:12px; color:#94a3b8;">Fen Bilimleri Portalı</p>
            </div>

            <div class="auth-tabs">
                <button id="btn-student-tab" class="auth-tab active" onclick="switchAuthTab('student')">Öğrenci</button>
                <button id="btn-teacher-tab" class="auth-tab" onclick="switchAuthTab('teacher')">Öğretmen</button>
            </div>

            <!-- Öğrenci Formu -->
            <div id="student-auth-form">
                <select id="student-grade" class="auth-input" onchange="updateStudentBranches()">
                    <option value="">-- Sınıf Seçin --</option>
                    <option value="5">5. Sınıf</option>
                    <option value="6">6. Sınıf</option>
                    <option value="7">7. Sınıf</option>
                    <option value="8">8. Sınıf</option>
                </select>
                <select id="student-branch" class="auth-input">
                    <option value="">-- Şube Seçin --</option>
                </select>
                <input type="number" id="student-number" class="auth-input" placeholder="Okul No">
                <input type="text" id="student-name" class="auth-input" placeholder="Ad Soyad">
                <button onclick="studentLogin()" class="auth-btn">Giriş Yap</button>
            </div>

            <!-- Öğretmen Formu -->
            <div id="teacher-auth-form" style="display:none;">
                <input type="email" id="teacher-email" class="auth-input" placeholder="E-posta">
                <input type="password" id="teacher-password" class="auth-input" placeholder="Şifre">
                <button onclick="teacherLogin()" class="auth-btn">Giriş Yap</button>
            </div>
        </div>
    </div>

    <!-- ==================== TEACHER PANEL ==================== -->
    <div id="teacher-panel" style="display:none; flex-direction:column; min-height:100vh;">
        <header class="teacher-header">
            <div class="header-brand">
                <span class="brand-icon">🔬</span>
                <h1>Öğretmen Paneli</h1>
            </div>
            <button onclick="logout()" class="logout-btn">Çıkış</button>
        </header>

        <section class="dashboard-content">
            <h3 style="margin-bottom:12px; font-size:15px; color:#94a3b8;">Yönetim</h3>
            <div class="grade-cards-grid" style="margin-bottom:20px;">
                <div class="grade-card" onclick="openManagementMenu()" style="border-top-color:#8b5cf6;">
                    <h3>⚙️ Yönetim İşlemleri</h3>
                    <p>Ünite, Bölüm, Ölçek, Rapor, Silme</p>
                    <span class="card-action">Gir →</span>
                </div>
            </div>

            <h3 style="margin-bottom:12px; font-size:15px; color:#94a3b8;">Sınıf Seçin</h3>
            <div class="grade-cards-grid">
                <div class="grade-card" onclick="openGradeManagement('5')" style="border-top-color:#3b82f6;">
                    <h3>5. Sınıflar</h3>
                    <p>Şubeler, Quizler ve Etkinlikler</p>
                    <span class="card-action">Yönetime Git →</span>
                </div>
                <div class="grade-card" onclick="openGradeManagement('6')" style="border-top-color:#3b82f6;">
                    <h3>6. Sınıflar</h3>
                    <p>Şubeler, Quizler ve Etkinlikler</p>
                    <span class="card-action">Yönetime Git →</span>
                </div>
                <div class="grade-card" onclick="openGradeManagement('7')" style="border-top-color:#3b82f6;">
                    <h3>7. Sınıflar</h3>
                    <p>Şubeler, Quizler ve Etkinlikler</p>
                    <span class="card-action">Yönetime Git →</span>
                </div>
                <div class="grade-card" onclick="openGradeManagement('8')" style="border-top-color:#3b82f6;">
                    <h3>8. Sınıflar</h3>
                    <p>Şubeler, Quizler ve Etkinlikler</p>
                    <span class="card-action">Yönetime Git →</span>
                </div>
            </div>
        </section>
    </div>

    <!-- ==================== GRADE DETAIL PANEL ==================== -->
    <div id="grade-detail-panel" style="display:none; flex-direction:column; min-height:100vh;"></div>

    <!-- ==================== STUDENT PANEL ==================== -->
    <div id="student-panel" style="display:none; flex-direction:column; min-height:100vh;"></div>

    <!-- ==================== MODAL ==================== -->
    <div id="app-modal" class="modal-overlay" style="display:none;">
        <div class="modal-box">
            <h3 id="modal-title" class="modal-title">Başlık</h3>
            <div id="modal-body"></div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="auth-btn" style="background:#475569; width:auto; padding:8px 14px;">İptal</button>
                <button id="modal-confirm-btn" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>
