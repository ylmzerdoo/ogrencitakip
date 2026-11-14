// ====================== SUPABASE ======================
const SUPABASE_URL = 'https://vaocsboltekfjknovpih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kctB4Az-JC9la65xOcLHmg_1n9XAufj';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Ana veri deposu
let fenData = {
    '5': { units: [], activities: [], branches: {}, lessons: [] },
    '6': { units: [], activities: [], branches: {}, lessons: [] },
    '7': { units: [], activities: [], branches: {}, lessons: [] },
    '8': { units: [], activities: [], branches: {}, lessons: [] }
};

// Türkçe karakter normalizasyonu
function normTR(str) {
    return (str || '').toString().trim().toUpperCase()
        .replace(/İ/g, 'I').replace(/I/g, 'I')
        .replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
        .replace(/ı/g, 'I').replace(/ş/g, 'S').replace(/ğ/g, 'G')
        .replace(/ü/g, 'U').replace(/ö/g, 'O').replace(/ç/g, 'C');
}

// ====================== VERİ YÜKLEME ======================
async function loadAllDataFromSupabase() {
    if (!supabaseClient) return;
    try {
        ['5','6','7','8'].forEach(function(g) {
            fenData[g].units = [];
            fenData[g].activities = [];
            fenData[g].branches = {};
            fenData[g].lessons = [];
        });

        // Şubeler
        const { data: branchRows } = await supabaseClient.from('branches').select('*');
        if (branchRows) {
            branchRows.forEach(function(row) {
                if (!row.grade || !row.branch_name) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{}, lessons:[] };
                if (!fenData[row.grade].branches[row.branch_name]) {
                    fenData[row.grade].branches[row.branch_name] = [];
                }
            });
        }

        // Öğrenciler
        const { data: studentRows } = await supabaseClient.from('students').select('*');
        if (studentRows) {
            studentRows.forEach(function(row) {
                if (!row.grade || !row.branch) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{}, lessons:[] };
                if (!fenData[row.grade].branches[row.branch]) fenData[row.grade].branches[row.branch] = [];
                fenData[row.grade].branches[row.branch].push({
                    id: row.id,
                    no: row.school_no,
                    name: row.name,
                    plus: row.plus || 0,
                    minus: row.minus || 0,
                    quiz: row.quiz || {},
                    scale: row.scale || {}
                });
            });
            Object.keys(fenData).forEach(function(g) {
                Object.keys(fenData[g].branches).forEach(function(b) {
                    fenData[g].branches[b].sort(function(a, b) { return parseInt(a.no) - parseInt(b.no); });
                });
            });
        }

        // Ünite & Bölümler
        const { data: unitRows } = await supabaseClient.from('units_sections').select('*');
        if (unitRows) {
            const unitMap = {};
            unitRows.forEach(function(row) {
                if (!row.grade || !row.unit_name) return;
                if (!unitMap[row.grade]) unitMap[row.grade] = {};
                if (!unitMap[row.grade][row.unit_name]) unitMap[row.grade][row.unit_name] = [];
                if (row.section_name && row.section_name !== 'Genel' && unitMap[row.grade][row.unit_name].indexOf(row.section_name) < 0) {
                    unitMap[row.grade][row.unit_name].push(row.section_name);
                }
            });
            Object.keys(unitMap).forEach(function(g) {
                // Önce temizle
                fenData[g].units = [];
                Object.keys(unitMap[g]).forEach(function(uName) {
                    fenData[g].units.push({ name: uName, sections: unitMap[g][uName] });
                });
            });
        }

        // Etkinlikler
        const { data: actRows } = await supabaseClient.from('activities').select('*');
        if (actRows) {
            actRows.forEach(function(row) {
                if (!row.grade) return;
                if (!fenData[row.grade].activities) fenData[row.grade].activities = [];
                fenData[row.grade].activities.push({
                    name: (row.activity_name || '').trim(),
                    unit: (row.unit_name || '').trim(),
                    section: (row.section_name || '').trim(),
                    criteria: row.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'],
                    scale_type: row.scale_type || '1-4'
                });
            });
        }

        // YENİ: Ders İçerikleri
        const { data: lessonRows } = await supabaseClient
            .from('lesson_contents')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (lessonRows) {
            lessonRows.forEach(function(row) {
                if (!row.grade) return;
                if (!fenData[row.grade]) fenData[row.grade] = { units:[], activities:[], branches:{}, lessons:[] };
                fenData[row.grade].lessons.push({
                    id: row.id,
                    unit: row.unit_name,
                    section: row.section_name,
                    type: row.content_type,
                    title: row.title,
                    description: row.description || '',
                    file_url: row.file_url,
                    file_path: row.file_path,
                    experiment_url: row.experiment_url,
                    quiz_data: row.quiz_data || [],
                    sort_order: row.sort_order || 0
                });
            });
        }

    } catch (err) {
        console.error('Veri yükleme hatası:', err);
    }
}

// ====================== YARDIMCI FONKSİYONLAR ======================
function getScoreBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    var num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">' + num + '</span>';
    return '<span class="badge badge-low">' + num + '</span>';
}

function getScaleBadge(score) {
    if (score === 'G') return '<span class="badge badge-neutral">G</span>';
    if (score === '-' || score === '' || score == null) return '<span class="badge badge-neutral">-</span>';
    var num = parseFloat(score);
    if (isNaN(num)) return '<span class="badge badge-neutral">' + score + '</span>';
    if (num >= 85) return '<span class="badge badge-high">%' + num + '</span>';
    if (num >= 50) return '<span class="badge badge-mid">%' + num + '</span>';
    return '<span class="badge badge-low">%' + num + '</span>';
}

function getContentTypeBadge(type) {
    const map = {
        pptx: { cls: 'content-type-pptx', label: 'PPTX' },
        pdf: { cls: 'content-type-pdf', label: 'PDF' },
        video: { cls: 'content-type-video', label: 'Video' },
        experiment: { cls: 'content-type-experiment', label: 'Deney' },
        quiz: { cls: 'content-type-quiz', label: 'Quiz' }
    };
    const item = map[type] || { cls: 'badge-neutral', label: type };
    return '<span class="content-type-badge ' + item.cls + '">' + item.label + '</span>';
}

function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
}

// ====================== HISTORY ======================
function saveState(state) {
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (window._skipHistory) return;
    try {
        history.pushState(state, '', '#' + (state.type || 'giris'));
    } catch (e) {
        console.log('pushState hatası', e);
    }
}

// Sayfa yüklendiğinde ilk history kaydını oluştur
if (!history.state) {
    history.replaceState({ type: 'auth' }, '', '#giris');
}

function restoreStateFromSession() {
    var saved = sessionStorage.getItem('fen_app_state');
    if (!saved) { renderAuthScreenView(false); return; }
    try { applyState(JSON.parse(saved), false); } catch (e) { renderAuthScreenView(false); }
}

function applyState(state, push) {
    if (!state || !state.type) {
        renderAuthScreenView(false);
        return;
    }
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    switch (state.type) {
        case 'teacher':
            renderTeacherPanelView(false);
            break;
        case 'grade-mgmt':
            openGradeManagement(state.grade, false);
            break;
        case 'branch-menu':
            openBranchMenu(state.grade, state.branchName, false);
            break;
        case 'branch-detail':
            openBranchDetail(state.grade, state.branchName, state.tab || 'students', false);
            break;
        case 'student':
            renderStudentPanelView(state.grade, state.branch, state.student, false);
            break;
        case 'lesson-ops':
            openLessonOperations(state.grade, false);
            break;
        case 'quiz-results':
            if (state.grade && state.branch) openStudentQuizResults(state.grade, state.branch);
            break;
        case 'activity-results':
            if (state.grade && state.branch) openStudentActivityResults(state.grade, state.branch);
            break;
        case 'plus-minus':
            if (state.grade && state.branch) openStudentPlusMinus(state.grade, state.branch);
            break;
        case 'content-view':
            if (state.contentId && state.grade && state.branch && state.unitName && state.sectionName) {
                openContentViewer(state.contentId, state.grade, state.branch, state.unitName, state.sectionName);
            }
            break;
        case 'student-lessons':
            if (state.grade && state.branch) openStudentLessons(state.grade, state.branch);
            break;
        case 'student-unit':
            if (state.grade && state.branch && state.unitName) openStudentUnit(state.grade, state.branch, state.unitName);
            break;
        case 'student-section':
            if (state.grade && state.branch && state.unitName && state.sectionName) openStudentSection(state.grade, state.branch, state.unitName, state.sectionName);
            break;
        case 'content-list':
            if (state.contentType && state.grade && state.branch && state.unitName && state.sectionName) openContentList(state.contentType, state.grade, state.branch, state.unitName, state.sectionName);
            break;
        case 'management':
            openManagementMenu();
            break;
        case 'add-unit':
            openAddUnitPage();
            break;
        case 'add-section':
            openAddSectionPage();
            break;
        default:
            renderAuthScreenView(false);
    }
}

window.addEventListener('popstate', function(event) {
    window._skipHistory = true;
    var state = event.state;
    if (state && state.type) {
        applyState(state, false);
        window._skipHistory = false;
        return;
    }
    // State yoksa session'dan dene
    var saved = sessionStorage.getItem('fen_app_state');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && parsed.type && parsed.type !== 'auth') {
                applyState(parsed, false);
                return;
            }
        } catch (e) {}
    }
    renderAuthScreenView(false);
});

// ====================== AUTH ======================
function switchAuthTab(role) {
    var sBtn = document.getElementById('btn-student-tab');
    var tBtn = document.getElementById('btn-teacher-tab');
    var sForm = document.getElementById('student-auth-form');
    var tForm = document.getElementById('teacher-auth-form');
    if (!sBtn || !tBtn || !sForm || !tForm) return;
    if (role === 'student') {
        sBtn.classList.add('active'); tBtn.classList.remove('active');
        sForm.style.display = 'block'; tForm.style.display = 'none';
        updateStudentBranches();
    } else {
        tBtn.classList.add('active'); sBtn.classList.remove('active');
        tForm.style.display = 'block'; sForm.style.display = 'none';
    }
}

function updateStudentBranches() {
    var gradeSel = document.getElementById('student-grade');
    var branchSel = document.getElementById('student-branch');
    if (!gradeSel || !branchSel) return;
    var grade = gradeSel.value;
    branchSel.innerHTML = '<option value="">-- Şube Seçin --</option>';
    if (!grade || !fenData[grade] || !fenData[grade].branches) return;
    var branches = Object.keys(fenData[grade].branches);
    if (branches.length === 0) {
        branchSel.innerHTML += '<option value="" disabled>Şube bulunamadı</option>';
        return;
    }
    branches.forEach(function(b) {
        var short = b.indexOf('/') >= 0 ? b.split('/')[1] : b;
        var opt = document.createElement('option');
        opt.value = b;
        opt.textContent = short + ' Şubesi';
        branchSel.appendChild(opt);
    });
}

async function teacherLogin() {
    var email = document.getElementById('teacher-email')?.value.trim();
    var password = document.getElementById('teacher-password')?.value.trim();
    if (!email || !password) return alert('E-posta ve şifre girin.');
    try {
        if (supabaseClient) {
            var res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
            if (res.error) return alert('Giriş başarısız: ' + res.error.message);
        }
        await loadAllDataFromSupabase();
        renderTeacherPanelView(true);
    } catch (e) { alert('Giriş hatası'); }
}

async function studentLogin() {
    var grade = document.getElementById('student-grade')?.value;
    var branch = document.getElementById('student-branch')?.value;
    var no = parseInt(document.getElementById('student-number')?.value);
    var nameRaw = document.getElementById('student-name')?.value.trim();
    if (!grade || !branch || !no || !nameRaw) return alert('Tüm alanları doldurun.');
    await loadAllDataFromSupabase();
    var list = fenData[grade]?.branches?.[branch] || [];
    var name = normTR(nameRaw);
    var found = list.find(function(s) {
        return parseInt(s.no) === no && normTR(s.name) === name;
    });
    if (!found) {
        return alert('Öğrenci bulunamadı.');
    }
    renderStudentPanelView(grade, branch, found, true);
}

function logout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    sessionStorage.removeItem('fen_app_state');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
}

function logoutStudent() {
    sessionStorage.removeItem('fen_app_state');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
}

function renderAuthScreenView(push) {
    if (push) saveState({ type: 'auth' });
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    closeModal();
}

function renderTeacherPanelView(push) {
    if (push) saveState({ type: 'teacher' });
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'flex';
    closeModal();
}

function toggleTeacherActionsCard() {
    var cont = document.getElementById('teacher-actions-container');
    var icon = document.getElementById('teacher-actions-toggle-icon');
    if (!cont) return;
    var open = cont.style.display !== 'none';
    cont.style.display = open ? 'none' : 'block';
    if (icon) icon.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

function openModal(title, html, onConfirm) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = html;
    var btn = document.getElementById('modal-confirm-btn');
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    if (onConfirm) { newBtn.style.display = 'inline-block'; newBtn.onclick = onConfirm; }
    else { newBtn.style.display = 'none'; }
    document.getElementById('app-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('app-modal').style.display = 'none';
}

// ====================== SINIF & ŞUBE ======================
function openManagementMenu() {
    saveState({ type: "management" });
    var panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Yönetim İşlemleri</h1></div>' +
            '<div>' +
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px;margin:0 auto;">' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openAddUnitPage()" style="border-top-color:#8b5cf6;">' +
                    '<h3>Ünite Ekle</h3><span class="card-action">Git →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openAddSectionPage()" style="border-top-color:#06b6d4;">' +
                    '<h3>Bölüm Ekle</h3><span class="card-action">Git →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="globalAddActivity()" style="border-top-color:#10b981;">' +
                    '<h3>Ölçek Yükle</h3><span class="card-action">Git →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="globalAddReportTemplate()" style="border-top-color:#f59e0b;">' +
                    '<h3>Rapor Şablonu</h3><span class="card-action">Git →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="globalDeleteManagement()" style="border-top-color:#ef4444;">' +
                    '<h3>Silme Yönetimi</h3><span class="card-action">Git →</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

function openManagementPage(title, contentHtml) {
    var panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + title + '</h1></div>' +
            '<div>' +
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:700px;margin:0 auto;">' +
            contentHtml +
        '</section>';
}

function openAddUnitPage() {
    saveState({ type: "add-unit" });
    var html = '<label style="font-size:13px;color:#cbd5e1;">Sınıf</label>' +
        '<select id="mgmt-grade" class="auth-input"><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select>' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Ünite Adı</label>' +
        '<input type="text" id="mgmt-unit" class="auth-input" placeholder="1.ÜNİTE ...">' +
        '<button onclick="saveNewUnit()" class="auth-btn" style="margin-top:16px;">Kaydet</button>';
    openManagementPage('Ünite Ekle', html);
}

function openAddSectionPage() {
    saveState({ type: "add-section" });
    var html = '<label style="font-size:13px;color:#cbd5e1;">Sınıf</label>' +
        '<select id="mgmt-grade" class="auth-input" onchange="fillMgmtUnits()"><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select>' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Ünite</label>' +
        '<select id="mgmt-unit" class="auth-input"></select>' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Bölüm Adı</label>' +
        '<input type="text" id="mgmt-section" class="auth-input" placeholder="1. Bölüm ...">' +
        '<button onclick="saveNewSection()" class="auth-btn" style="margin-top:16px;">Kaydet</button>';
    openManagementPage('Bölüm Ekle', html);
    setTimeout(fillMgmtUnits, 50);
}

function fillMgmtUnits() {
    var grade = document.getElementById('mgmt-grade').value;
    var sel = document.getElementById('mgmt-unit');
    if (!sel) return;
    sel.innerHTML = '';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

async function saveNewUnit() {
    var grade = document.getElementById('mgmt-grade').value;
    var name = document.getElementById('mgmt-unit').value.trim();
    if (!name) return alert('Ünite adı girin');
    if (supabaseClient) {
        var res = await supabaseClient.from('units_sections').insert([{ grade: grade, unit_name: name, section_name: 'Genel' }]);
        if (res.error) return alert(res.error.message);
    }
    await loadAllDataFromSupabase();
    alert('Ünite eklendi');
    renderTeacherPanelView(false);
}

async function saveNewSection() {
    var grade = document.getElementById('mgmt-grade').value;
    var unit = document.getElementById('mgmt-unit').value;
    var section = document.getElementById('mgmt-section').value.trim();
    if (!unit || !section) return alert('Ünite ve bölüm girin');
    if (supabaseClient) {
        var res = await supabaseClient.from('units_sections').insert([{ grade: grade, unit_name: unit, section_name: section }]);
        if (res.error) return alert(res.error.message);
    }
    await loadAllDataFromSupabase();
    alert('Bölüm eklendi');
    renderTeacherPanelView(false);
}

function openGradeManagement(grade, push) {
    if (push) saveState({ type: 'grade-mgmt', grade: grade });
    var panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';

    var branches = Object.keys(fenData[grade]?.branches || {});
    var branchCards = '';
    branches.forEach(function(b) {
        var short = b.indexOf('/') >= 0 ? b.split('/')[1] : b;
        var count = (fenData[grade].branches[b] || []).length;
        branchCards += '<div class="grade-card" onclick="openBranchMenu(\'' + grade + '\',\'' + b + '\', true)" style="border-top-color:#3b82f6;">' +
            '<h3>' + short + ' Şubesi</h3>' +
            '<p>' + count + ' öğrenci</p>' +
            '<span class="card-action">Gir</span>' +
            '<button onclick="event.stopPropagation();deleteBranch(\'' + grade + '\',\'' + b + '\')" class="btn-pastel-red" style="position:absolute;top:8px;right:8px;font-size:10px;">Sil</button>' +
        '</div>';
    });

    var lessonCard = '<div class="grade-card" onclick="openLessonOperations(\'' + grade + '\', true)" style="border-top-color:#f59e0b;">' +
        '<h3>Ders İşlemleri</h3>' +
        '<p>İçerik ekle / yönet</p>' +
        '<span class="card-action">Gir</span>' +
    '</div>';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sınıflar</h1></div>' +
            '<div>' +
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<button onclick="addNewBranchModal(\'' + grade + '\')" class="auth-btn" style="width:auto; padding:8px 16px; background:#059669; margin-bottom:14px;">+ Yeni Şube Ekle</button>' +
            '<div class="grade-cards-grid">' + lessonCard + (branchCards || '<p style="color:#94a3b8;">Henüz şube yok.</p>') + '</div>' +
        '</section>';
}

function addNewBranchModal(grade) {
    openModal('Yeni Şube Ekle',
        '<label style="font-size:13px; color:#cbd5e1;">Şube Adı (A, B, C...)</label>' +
        '<input type="text" id="modal-branch-name" class="auth-input" placeholder="A">',
    async function() {
        var name = document.getElementById('modal-branch-name').value.trim().toUpperCase();
        if (!name) return;
        var full = grade + '/' + name;
        if (supabaseClient) {
            var res = await supabaseClient.from('branches').insert([{ grade: grade, branch_name: full }]);
            if (res.error) return alert(res.error.message);
        }
        await loadAllDataFromSupabase();
        closeModal();
        openGradeManagement(grade, false);
    });
}

async function deleteBranch(grade, bName) {
    if (!confirm(bName + ' şubesini silmek istediğinize emin misiniz?')) return;
    if (supabaseClient) {
        await supabaseClient.from('branches').delete().eq('grade', grade).eq('branch_name', bName);
        await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', bName);
    }
    await loadAllDataFromSupabase();
    openGradeManagement(grade, false);
}

function openBranchMenu(grade, branchName, push) {
    if (push !== false) saveState({ type: 'branch-menu', grade: grade, branchName: branchName });
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sınıf - ' + branchName + '</h1></div>' +
            '<div>' +
                '<button onclick="openGradeManagement(\'' + grade + '\', false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'students\', true)" style="border-top-color:#3b82f6;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">1</div><h3>Sınıf Listesi</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'quizzes\', true)" style="border-top-color:#8b5cf6;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">2</div><h3>Quiz Sonuçları</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'activities\', true)" style="border-top-color:#10b981;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">3</div><h3>Etkinlik Ölçekleri</h3><span class="card-action">Git</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'reports\', true)" style="border-top-color:#f59e0b;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">4</div><h3>Raporlar</h3><span class="card-action">Git</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

// ====================== DERS İŞLEMLERİ (YENİ) ======================
function openLessonOperations(grade, push) {
    if (push !== false) saveState({ type: 'lesson-ops', grade: grade });
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sınıf - Ders İşlemleri</h1></div>' +
            '<div>' +
                '<button onclick="openGradeManagement(\'' + grade + '\', false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<h3 style="margin-bottom:14px; font-size:15px; color:#94a3b8;">İçerik Ekle</h3>' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openAddContentModal(\'' + grade + '\',\'pptx\')" style="border-top-color:#7c3aed;">' +
                    '<h3>📄 Konu Anlatımı (PPTX)</h3><span class="card-action">Ekle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openAddContentModal(\'' + grade + '\',\'video\')" style="border-top-color:#0891b2;">' +
                    '<h3>🎬 Video Ekle</h3><span class="card-action">Ekle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openAddContentModal(\'' + grade + '\',\'experiment\')" style="border-top-color:#059669;">' +
                    '<h3>🔬 Deney Ekle</h3><span class="card-action">Ekle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openAddContentModal(\'' + grade + '\',\'quiz\')" style="border-top-color:#d97706;">' +
                    '<h3>📝 Quiz Ekle (Word)</h3><span class="card-action">Ekle →</span>' +
                '</div>' +
            '</div>' +
            '<h3 style="margin:24px 0 12px; font-size:15px; color:#94a3b8;">Mevcut İçerikler</h3>' +
            '<div id="existing-lessons-list"></div>' +
        '</section>';

    renderExistingLessons(grade);
}

function renderExistingLessons(grade) {
    var container = document.getElementById('existing-lessons-list');
    if (!container) return;
    var lessons = fenData[grade]?.lessons || [];
    if (lessons.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:13px;">Henüz içerik eklenmemiş.</p>';
        return;
    }

    // Ünite ve bölüme göre grupla
    var grouped = {};
    lessons.forEach(function(l) {
        var key = l.unit + '|||' + l.section;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(l);
    });

    var html = '';
    Object.keys(grouped).forEach(function(key) {
        var parts = key.split('|||');
        html += '<div style="margin-bottom:16px;">' +
            '<div style="font-size:13px; font-weight:600; color:#94a3b8; margin-bottom:8px;">' + parts[0] + ' → ' + parts[1] + '</div>';
        grouped[key].forEach(function(l) {
            html += '<div class="content-card">' +
                '<div class="content-card-header">' +
                    '<div>' + getContentTypeBadge(l.type) + ' <span style="margin-left:8px; font-weight:500;">' + l.title + '</span></div>' +
                    '<button onclick="deleteLessonContent(\'' + l.id + '\',\'' + grade + '\')" class="btn-pastel-red" style="font-size:11px;">Sil</button>' +
                '</div>' +
                (l.description ? '<p style="font-size:12px; color:#94a3b8; margin-top:4px;">' + l.description + '</p>' : '') +
            '</div>';
        });
        html += '</div>';
    });
    container.innerHTML = html;
}

function openAddContentModal(grade, type) {
    var typeLabels = {
        pptx: 'PPTX Dosyası',
        pdf: 'PDF Dosyası',
        video: 'Video (URL veya dosya)',
        experiment: 'Deney URL',
        quiz: 'Word Quiz Dosyası'
    };

    var unitOpts = '<option value="">-- Ünite Seçin --</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        unitOpts += '<option value="' + u.name + '">' + u.name + '</option>';
    });

    var html =
        '<label style="font-size:13px; color:#cbd5e1;">Ünite</label>' +
        '<select id="m-unit" class="auth-input" onchange="fillModalSectionsLesson(\'' + grade + '\')">' + unitOpts + '</select>' +
        '<label style="font-size:13px; color:#cbd5e1;">Bölüm</label>' +
        '<select id="m-section" class="auth-input"><option value="">-- Bölüm Seçin --</option></select>';

    if (type === 'experiment') {
        html += '<label style="font-size:13px; color:#cbd5e1;">Deney Adı (opsiyonel)</label>' +
                '<input type="text" id="m-title" class="auth-input" placeholder="Örn: Ayın Evreleri">' +
                '<label style="font-size:13px; color:#cbd5e1;">Deney URL</label>' +
                '<input type="url" id="m-url" class="auth-input" placeholder="https://...">';
    } else if (type === 'video') {
        html += '<label style="font-size:13px; color:#cbd5e1;">Video Adı (opsiyonel)</label>' +
                '<input type="text" id="m-title" class="auth-input" placeholder="Örn: Güneş Videosu">' +
                '<label style="font-size:13px; color:#cbd5e1;">Video URL (YouTube vb.)</label>' +
                '<input type="url" id="m-url" class="auth-input" placeholder="https://...">';
    } else if (type === 'quiz') {
        html += '<label style="font-size:13px; color:#cbd5e1;">Word Quiz Dosyası</label>' +
                '<input type="file" id="m-file" class="auth-input" accept=".docx,.doc">' +
                '<label style="font-size:13px; color:#cbd5e1;margin-top:8px;">Cevap Anahtarı (Word veya TXT)</label>' +
                '<input type="file" id="m-key" class="auth-input" accept=".docx,.doc,.txt">' +
                '<p style="font-size:11px;color:#64748b;margin-top:4px;">Cevap anahtarı formatı: 1-C  2-B  3-A ... veya her satırda 1. C</p>';
    } else if (type === 'pptx') {
        html += '<label style="font-size:13px; color:#cbd5e1;">PPTX Dosyası</label>' +
                '<input type="file" id="m-file" class="auth-input" accept=".pptx,.ppt">' +
                '<label style="font-size:13px; color:#cbd5e1;margin-top:8px;">Toplam Slayt Sayısı</label>' +
                '<input type="number" id="m-slides" class="auth-input" placeholder="Örn: 19" min="1" value="10">';
    } else {
        html += '<label style="font-size:13px; color:#cbd5e1;">' + typeLabels[type] + '</label>' +
                '<input type="file" id="m-file" class="auth-input" accept="*">';
    }

    openModal(typeLabels[type] + ' Ekle', html, async function() {
        var btn = document.getElementById('modal-confirm-btn');
        var unit = document.getElementById('m-unit').value;
        var section = document.getElementById('m-section').value;
        var titleEl = document.getElementById('m-title');
        var descEl = document.getElementById('m-desc');
        var title = titleEl ? titleEl.value.trim() : '';
        var desc = descEl ? descEl.value.trim() : '';

        if (!unit || !section) return alert('Ünite ve bölüm zorunludur.');
        if (!title) {
            if (type === 'experiment') title = 'Deney';
            else if (type === 'video') title = 'Video';
            else if (type === 'pptx') title = 'Sunum';
            else if (type === 'quiz') title = 'Quiz';
            else title = 'İçerik';
        }

        var slideCount = 0;
        if (type === 'pptx') {
            var slidesEl = document.getElementById('m-slides');
            slideCount = slidesEl ? parseInt(slidesEl.value) || 10 : 10;
            desc = 'slides:' + slideCount;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Yükleniyor...';
        }

        try {
            var payload = {
                grade: grade,
                unit_name: unit,
                section_name: section,
                content_type: type,
                title: title,
                description: desc,
                sort_order: (fenData[grade]?.lessons || []).length
            };

            if (type === 'experiment' || type === 'video') {
                var url = document.getElementById('m-url').value.trim();
                if (!url) {
                    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                    return alert('URL girin.');
                }
                if (type === 'experiment') payload.experiment_url = url;
                else payload.file_url = url;
            } else {
                var fileInput = document.getElementById('m-file');
                if (!fileInput.files || !fileInput.files[0]) {
                    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                    return alert('Dosya seçin.');
                }
                var file = fileInput.files[0];

                function cleanPath(str) {
                    return (str || '')
                        .replace(/İ/g,'I').replace(/ı/g,'i')
                        .replace(/Ş/g,'S').replace(/ş/g,'s')
                        .replace(/Ğ/g,'G').replace(/ğ/g,'g')
                        .replace(/Ü/g,'U').replace(/ü/g,'u')
                        .replace(/Ö/g,'O').replace(/ö/g,'o')
                        .replace(/Ç/g,'C').replace(/ç/g,'c')
                        .replace(/[^a-zA-Z0-9._-]/g, '_')
                        .replace(/_+/g, '_');
                }
                var safeName = cleanPath(file.name);
                var path = grade + '/' + cleanPath(unit) + '/' + cleanPath(section) + '/' + Date.now() + '_' + safeName;

                console.log('Yükleniyor:', path, file.size, 'bytes');

                var { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('lesson-files')
                    .upload(path, file, { upsert: false });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                    return alert('Dosya yükleme hatası: ' + uploadError.message);
                }

                console.log('Upload OK:', uploadData);

                // Signed URL
                try {
                    var { data: signedData, error: signedError } = await supabaseClient.storage
                        .from('lesson-files')
                        .createSignedUrl(path, 60 * 60 * 24 * 365);
                    if (signedError || !signedData) {
                        console.warn('Signed URL hatası:', signedError);
                        var { data: urlData } = supabaseClient.storage.from('lesson-files').getPublicUrl(path);
                        payload.file_url = urlData.publicUrl;
                    } else {
                        payload.file_url = signedData.signedUrl;
                    }
                } catch (e) {
                    console.warn('Signed URL exception:', e);
                    var { data: urlData } = supabaseClient.storage.from('lesson-files').getPublicUrl(path);
                    payload.file_url = urlData.publicUrl;
                }
                payload.file_path = path;
                console.log('URL hazır:', payload.file_url ? 'OK' : 'YOK');

                if (type === 'quiz') {
                    console.log('Quiz parse başlıyor...');
                    try {
                        var arrayBuffer = await file.arrayBuffer();
                        var result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                        console.log('Mammoth OK, metin uzunluğu:', (result.value || '').length);
                        payload.quiz_data = parseQuizFromText(result.value || '');
                        console.log('Quiz parse tamam:', payload.quiz_data.length, 'soru');

                        // Cevap anahtarı varsa işle
                        var keyInput = document.getElementById('m-key');
                        if (keyInput && keyInput.files && keyInput.files[0]) {
                            var keyFile = keyInput.files[0];
                            var keyText = '';
                            if (keyFile.name.endsWith('.txt')) {
                                keyText = await keyFile.text();
                            } else {
                                var keyBuf = await keyFile.arrayBuffer();
                                var keyRes = await mammoth.extractRawText({ arrayBuffer: keyBuf });
                                keyText = keyRes.value || '';
                            }
                            console.log('Cevap anahtarı okundu, uzunluk:', keyText.length);
                            applyAnswerKey(payload.quiz_data, keyText);
                        }
                    } catch (err) {
                        console.error('Word parse hatası:', err);
                        alert('Word okunamadı, quiz boş kaydedilecek.');
                        payload.quiz_data = [];
                    }
                }
            }

            console.log('Veritabanına yazılıyor...');
            var { error } = await supabaseClient.from('lesson_contents').insert([payload]);
            if (error) {
                console.error('DB insert error:', error);
                if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                return alert('Kayıt hatası: ' + error.message);
            }
            console.log('DB OK');

            await loadAllDataFromSupabase();
            closeModal();
            openLessonOperations(grade, false);
            alert('İçerik eklendi.');
        } catch (err) {
            console.error('Genel hata:', err);
            if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
            alert('Hata: ' + (err.message || err));
        } finally {
            // Her durumda butonu sıfırla (modal kapanmazsa)
            setTimeout(function() {
                var b = document.getElementById('modal-confirm-btn');
                if (b && b.textContent === 'Yükleniyor...') {
                    b.disabled = false;
                    b.textContent = 'Kaydet';
                }
            }, 500);
        }
    });
}

function fillModalSectionsLesson(grade) {
    var unit = document.getElementById('m-unit')?.value;
    var sel = document.getElementById('m-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    var unitObj = (fenData[grade]?.units || []).find(function(u) { return u.name === unit; });
    if (unitObj) {
        unitObj.sections.forEach(function(s) {
            sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
        });
    }
}

// Basit Word quiz parser (soru + şık yapısını yakalamaya çalışır)
function applyAnswerKey(questions, keyText) {
    if (!questions || !keyText) return;
    var lines = keyText.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
    var map = {};
    lines.forEach(function(line) {
        // 1-C  1.C  1) C  1:C  1 C
        var m = line.match(/(\d+)\s*[\.\)\-\:\s]\s*([A-Da-d])\b/);
        if (m) {
            map[parseInt(m[1])] = m[2].toUpperCase();
        }
    });
    questions.forEach(function(q, i) {
        if (map[i+1]) q.correct = map[i+1];
    });
    console.log('Cevap anahtarı uygulandı:', Object.keys(map).length, 'eşleşme');
}

function parseQuizFromText(text) {
    var clean = (text || '').replace(/\r/g, '\n');
    var lines = clean.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    var questions = [];
    var current = null;

    function splitOptions(str) {
        var result = [];
        var parts = str.split(/([A-D])[\.\)\-\:]\s*/i);
        for (var i = 1; i < parts.length; i += 2) {
            var key = (parts[i] || '').toUpperCase();
            var val = (parts[i + 1] || '').trim();
            if (key && /[A-D]/.test(key)) {
                result.push({ key: key, text: val });
            }
        }
        return result;
    }

    function pushCurrent() {
        if (!current || !current.question) return;
        if (current.options.length <= 1) {
            var source = current.question;
            if (current.options.length === 1) source += ' ' + current.options[0].text;
            var split = splitOptions(source);
            if (split.length >= 2) {
                var firstKeyPos = source.search(/[A-D][\.\)\-\:]/);
                if (firstKeyPos > 0) current.question = source.substring(0, firstKeyPos).trim();
                current.options = split;
            }
        }
        var cleaned = [];
        current.options.forEach(function(opt) {
            var inner = splitOptions(opt.key + ') ' + opt.text);
            if (inner.length > 1) {
                inner.forEach(function(i) { cleaned.push(i); });
            } else {
                cleaned.push(opt);
            }
        });
        current.options = cleaned;
        questions.push(current);
    }

    lines.forEach(function(line) {
        var qMatch = line.match(/^(\d+)[\.\)\-\:]\s*(.+)/);
        if (qMatch) {
            pushCurrent();
            current = { question: qMatch[2].trim(), options: [], correct: null };
            if (/[A-D][\.\)\-\:]/.test(qMatch[2])) {
                var split = splitOptions(qMatch[2]);
                if (split.length >= 2) {
                    var pos = qMatch[2].search(/[A-D][\.\)\-\:]/);
                    current.question = qMatch[2].substring(0, pos).trim();
                    current.options = split;
                }
            }
            return;
        }

        var oMatch = line.match(/^([A-Da-d])[\.\)\-\:]\s*(.*)/);
        if (oMatch && current) {
            if ((line.match(/[A-D][\.\)\-\:]/gi) || []).length >= 2) {
                splitOptions(line).forEach(function(m) { current.options.push(m); });
            } else {
                current.options.push({ key: oMatch[1].toUpperCase(), text: (oMatch[2] || '').trim() });
            }
            return;
        }

        if (current && (/[A-D][\.\)\-\:]/.test(line)) && (line.match(/[A-D][\.\)\-\:]/gi) || []).length >= 2) {
            splitOptions(line).forEach(function(m) { current.options.push(m); });
            return;
        }

        var cMatch = line.match(/(doğru|cevap|correct|yanıt)[\s\:\-]*([A-Da-d])/i);
        if (cMatch && current) {
            current.correct = cMatch[2].toUpperCase();
            return;
        }

        if (current && current.options.length === 0 && line.length > 2) {
            current.question += ' ' + line;
        }
    });
    pushCurrent();

    // Cevap anahtarı tarama (son sayfa / ayrı bölüm)
    var fullText = lines.join(' ');
    // Formatlar: 1-C  1.C  1) C  1:C  veya "1 C"
    var keyMatches = fullText.match(/(\d+)\s*[\.\)\-\:]\s*([A-Da-d])\b/g) || [];
    var keyMap = {};
    keyMatches.forEach(function(m) {
        var parts = m.match(/(\d+)\s*[\.\)\-\:]\s*([A-Da-d])/);
        if (parts) {
            var num = parseInt(parts[1]);
            var ans = parts[2].toUpperCase();
            if (num > 0 && num <= questions.length + 5) keyMap[num] = ans;
        }
    });
    // Daha sıkı: sadece "cevap" veya "anahtar" kelimesinden sonraki kısım
    var answerSection = fullText.split(/(cevap\s*anahtar|doğru\s*cevaplar|answer\s*key)/i);
    if (answerSection.length > 1) {
        var after = answerSection.slice(1).join(' ');
        var km = after.match(/(\d+)\s*[\.\)\-\:]\s*([A-Da-d])\b/g) || [];
        km.forEach(function(m) {
            var parts = m.match(/(\d+)\s*[\.\)\-\:]\s*([A-Da-d])/);
            if (parts) keyMap[parseInt(parts[1])] = parts[2].toUpperCase();
        });
    }

    questions.forEach(function(q, i) {
        if (!q.correct && keyMap[i + 1]) {
            q.correct = keyMap[i + 1];
        }
    });

    return questions;
}

async function deleteLessonContent(id, grade) {
    if (!confirm('Bu içeriği silmek istediğinize emin misiniz?')) return;
    // Önce storage'dan sil (varsa)
    var lesson = (fenData[grade]?.lessons || []).find(function(l) { return l.id === id; });
    if (lesson && lesson.file_path) {
        await supabaseClient.storage.from('lesson-files').remove([lesson.file_path]);
    }
    await supabaseClient.from('lesson_contents').delete().eq('id', id);
    await loadAllDataFromSupabase();
    openLessonOperations(grade, false);
}

// ====================== ÖĞRENCİ PANELİ (TEMEL) ======================
function renderStudentPanelView(grade, branch, student, push) {
    if (push) saveState({ type: 'student', grade: grade, branch: branch, student: student });
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    var panel = document.getElementById('student-panel');
    panel.style.display = 'flex';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + student.name + '</h1></div>' +
            '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px; margin:0 auto;">' +
            '<h3 style="margin-bottom:14px; font-size:15px; color:#94a3b8;">Ana Menü</h3>' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openStudentLessons(\'' + grade + '\',\'' + branch + '\')" style="border-top-color:#3b82f6;">' +
                    '<h3>📚 Ders</h3><p>Konu, Video, Deney, Quiz</p><span class="card-action">Gir →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openStudentQuizResults(\'' + grade + '\',\'' + branch + '\')" style="border-top-color:#8b5cf6;">' +
                    '<h3>Quiz Sonuçları</h3><span class="card-action">Görüntüle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openStudentActivityResults(\'' + grade + '\',\'' + branch + '\')" style="border-top-color:#10b981;">' +
                    '<h3>Etkinlik Sonuçları</h3><span class="card-action">Görüntüle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openStudentPlusMinus(\'' + grade + '\',\'' + branch + '\')" style="border-top-color:#f59e0b;">' +
                    '<h3>➕➖ Puanlarım</h3><p>Artı ve eksi puanlar</p><span class="card-action">Görüntüle →</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

// ====================== BASİT GRAFİK OLUŞTURUCU ======================
function generateSimpleChart(labels, values, title) {
    if (!values || values.length === 0) return '<p style="color:#64748b;font-size:13px;text-align:center;">Grafik için yeterli veri yok.</p>';
    var w = 560, h = 220, pad = 40;
    var maxY = Math.max(100, Math.max.apply(null, values) + 10);
    var stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    var points = '';
    var circles = '';
    var xLabels = '';
    values.forEach(function(v, i) {
        var x = pad + i * stepX;
        var y = h - pad - (v / maxY) * (h - pad * 2);
        points += (i === 0 ? '' : ' ') + x + ',' + y;
        circles += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#3b82f6" stroke="#fff" stroke-width="1.5"/>';
        circles += '<text x="' + x + '" y="' + (y - 12) + '" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="600">' + v + '</text>';
        var lab = labels[i] || '';
        if (lab.length > 12) lab = lab.substring(0, 10) + '...';
        xLabels += '<text x="' + x + '" y="' + (h - 8) + '" text-anchor="middle" fill="#94a3b8" font-size="9">' + lab + '</text>';
    });
    return '<div style="background:rgba(15,23,42,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:16px;">' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;text-align:center;">' + title + '</div>' +
        '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;max-width:100%;">' +
            '<line x1="' + pad + '" y1="' + pad + '" x2="' + (w-pad) + '" y2="' + pad + '" stroke="#334155" stroke-width="1"/>' +
            '<line x1="' + pad + '" y1="' + (h/2) + '" x2="' + (w-pad) + '" y2="' + (h/2) + '" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>' +
            '<line x1="' + pad + '" y1="' + (h-pad) + '" x2="' + (w-pad) + '" y2="' + (h-pad) + '" stroke="#334155" stroke-width="1"/>' +
            '<text x="6" y="' + (pad+4) + '" fill="#64748b" font-size="10">100</text>' +
            '<text x="6" y="' + (h/2+3) + '" fill="#64748b" font-size="10">50</text>' +
            '<text x="10" y="' + (h-pad+3) + '" fill="#64748b" font-size="10">0</text>' +
            '<polyline points="' + points + '" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round"/>' +
            circles + xLabels +
        '</svg></div>';
}

// ====================== KARNE İNDİR ======================
function downloadQuizPDF(grade, branch) {
    var student = null;
    try { student = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}').student; } catch(e){}
    if (!student) return alert('Öğrenci bilgisi yok');

    var units = fenData[grade]?.units || [];
    var rows = '';
    var qSum = 0, qCnt = 0;
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var key = u.name + '_' + sec;
            if (student.quiz && student.quiz[key] !== undefined && student.quiz[key] !== '') {
                var sc = student.quiz[key];
                rows += '<tr><td>' + u.name + ' / ' + sec + '</td><td style="text-align:center;">' + sc + '</td></tr>';
                if (sc !== 'G') { var n = parseFloat(sc); if (!isNaN(n)) { qSum += n; qCnt++; } }
            }
        });
    });
    var avg = qCnt ? Math.round(qSum / qCnt) : '-';

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quiz Sonuçları</title>' +
        '<style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px;}h2{margin:0 0 8px;}table{width:100%;border-collapse:collapse;margin-top:16px;}th,td{border:1px solid #ccc;padding:8px;}th{background:#f1f5f9;text-align:left;}</style></head><body>' +
        '<h2>Quiz Sonuçları</h2>' +
        '<p><b>Öğrenci:</b> ' + student.name + ' &nbsp;&nbsp; <b>No:</b> ' + student.no + ' &nbsp;&nbsp; <b>Sınıf:</b> ' + grade + '/' + (branch.split('/')[1]||branch) + '</p>' +
        '<p><b>Ortalama:</b> ' + avg + '</p>' +
        '<table><thead><tr><th>Ünite / Bölüm</th><th style="width:60px;text-align:center;">Not</th></tr></thead><tbody>' + (rows || '<tr><td colspan="2">Sonuç yok</td></tr>') + '</tbody></table>' +
        '<p style="margin-top:20px;font-size:11px;color:#666;">Fenomenal Fen Bilimleri</p>' +
        '<script>window.onload=function(){window.print();}<\/script>' +
        '</body></html>';

    var w = window.open('', '_blank');
    if (!w) return alert('Pop-up engellendi');
    w.document.write(html);
    w.document.close();
}

function downloadActivityPDF(grade, branch) {
    var student = null;
    try { student = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}').student; } catch(e){}
    if (!student) return alert('Öğrenci bilgisi yok');

    var units = fenData[grade]?.units || [];
    var rows = '';
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var acts = (fenData[grade]?.activities || []).filter(function(a) { return a.unit === u.name && a.section === sec; });
            var activityGroups = {};
            acts.forEach(function(a) {
                var baseName = a.name;
                if (baseName.indexOf(' - ') >= 0) {
                    var parts = baseName.split(' - ');
                    if (parts.length >= 2) baseName = parts[0] + ' - ' + parts[1];
                }
                if (!activityGroups[baseName]) activityGroups[baseName] = { scores: [] };
                var sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== '' && sc !== null && sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) activityGroups[baseName].scores.push(num);
                }
            });
            Object.keys(activityGroups).forEach(function(baseName) {
                var group = activityGroups[baseName];
                if (group.scores.length === 0) return;
                var avg = Math.round(group.scores.reduce(function(a,b){return a+b;},0) / group.scores.length);
                rows += '<tr><td><b>' + u.name + '</b><br><span style="font-size:11px;color:#666;">' + sec + '</span><br><span style="color:#3b82f6;">' + baseName + '</span></td><td style="text-align:center;font-weight:bold;">%' + avg + '</td></tr>';
            });
        });
    });

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etkinlik Notları</title>' +
        '<style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px;}h2{margin:0 0 8px;}table{width:100%;border-collapse:collapse;margin-top:16px;}th,td{border:1px solid #ccc;padding:8px;vertical-align:top;}th{background:#f1f5f9;text-align:left;}</style></head><body>' +
        '<h2>Etkinlik Notları</h2>' +
        '<p><b>Öğrenci:</b> ' + student.name + ' &nbsp;&nbsp; <b>No:</b> ' + student.no + ' &nbsp;&nbsp; <b>Sınıf:</b> ' + grade + '/' + (branch.split('/')[1]||branch) + '</p>' +
        '<table><thead><tr><th>Ünite / Bölüm / Etkinlik</th><th style="width:70px;text-align:center;">Ort</th></tr></thead><tbody>' + (rows || '<tr><td colspan="2">Not yok</td></tr>') + '</tbody></table>' +
        '<p style="margin-top:20px;font-size:11px;color:#666;">Fenomenal Fen Bilimleri</p>' +
        '<script>window.onload=function(){window.print();}<\/script>' +
        '</body></html>';

    var w = window.open('', '_blank');
    if (!w) return alert('Pop-up engellendi');
    w.document.write(html);
    w.document.close();
}

function downloadStudentKarne(grade, branch) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    var units = fenData[grade]?.units || [];
    var qSum = 0, qCnt = 0, quizRows = '';
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var key = u.name + '_' + sec;
            if (student.quiz && student.quiz[key] !== undefined && student.quiz[key] !== '') {
                var sc = student.quiz[key];
                quizRows += '<tr><td>' + u.name + '</td><td>' + sec + '</td><td style="text-align:center;">' + sc + '</td></tr>';
                if (sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) { qSum += num; qCnt++; }
                }
            }
        });
    });
    var qAvg = qCnt ? Math.round(qSum / qCnt) : '-';

    var sSum = 0, sCnt = 0, scaleRows = '';
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var acts = (fenData[grade]?.activities || []).filter(function(a) {
                return a.unit === u.name && a.section === sec;
            });
            var activityGroups = {};
            acts.forEach(function(a) {
                var baseName = a.name;
                if (baseName.indexOf(' - ') >= 0) {
                    var parts = baseName.split(' - ');
                    if (parts.length >= 2) baseName = parts[0] + ' - ' + parts[1];
                }
                if (!activityGroups[baseName]) activityGroups[baseName] = { scores: [] };
                var sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== '' && sc !== null && sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) activityGroups[baseName].scores.push(num);
                }
            });
            Object.keys(activityGroups).forEach(function(baseName) {
                var group = activityGroups[baseName];
                if (group.scores.length === 0) return;
                var avg = Math.round(group.scores.reduce(function(a,b){return a+b;},0) / group.scores.length);
                scaleRows += '<tr><td>' + u.name + '</td><td>' + sec + '</td><td>' + baseName + '</td><td style="text-align:center;">%' + avg + '</td></tr>';
                sSum += avg; sCnt++;
            });
        });
    });
    var sAvg = sCnt ? Math.round(sSum / sCnt) : '-';

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Karne - ' + student.name + '</title>' +
        '<style>' +
        'body{font-family:Arial,sans-serif;padding:30px;color:#111;}' +
        'h1{text-align:center;font-size:22px;margin-bottom:4px;}' +
        'h2{text-align:center;font-size:16px;color:#444;margin-top:0;}' +
        '.info{margin:16px 0;font-size:14px;line-height:1.6;}' +
        'table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;}' +
        'th,td{border:1px solid #ccc;padding:6px 8px;}' +
        'th{background:#3b82f6;color:#fff;}' +
        'h3{font-size:15px;margin:18px 0 6px;}' +
        '@media print{body{padding:10px;}}' +
        '</style></head><body>' +
        '<h1>FENOMENAL FEN BİLİMLERİ</h1>' +
        '<h2>Öğrenci Karnesi</h2>' +
        '<div class="info">' +
            '<div><b>Ad:</b> ' + student.name + '</div>' +
            '<div><b>No / Şube:</b> ' + student.no + ' | ' + grade + '. Sınıf - ' + branch + '</div>' +
            '<div><b>Artı / Eksi:</b> ' + (student.plus || 0) + ' / ' + (student.minus || 0) + '</div>' +
        '</div>' +
        '<h3>Quiz Ortalaması: ' + qAvg + '</h3>' +
        '<table><thead><tr><th>Ünite</th><th>Bölüm</th><th>Not</th></tr></thead><tbody>' +
        (quizRows || '<tr><td colspan="3">Veri yok</td></tr>') +
        '</tbody></table>' +
        '<h3>Etkinlik Ortalaması: ' + (sCnt ? '%' + sAvg : '-') + '</h3>' +
        '<table><thead><tr><th>Ünite</th><th>Bölüm</th><th>Etkinlik</th><th>Ort</th></tr></thead><tbody>' +
        (scaleRows || '<tr><td colspan="4">Veri yok</td></tr>') +
        '</tbody></table>' +
        '<div style="margin-top:40px;text-align:center;font-size:12px;color:#666;">Yazdır veya PDF olarak kaydet (Ctrl+P)</div>' +
        '</body></html>';

    var w = window.open('', '_blank');
    if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(function(){ w.print(); }, 400);
    } else {
        alert('Pop-up engellendi. Tarayıcı ayarlarından izin ver.');
    }
}

function getFenBadge(avg) {
    if (avg === '-' || avg == null) return { icon: '⭐', title: 'Başlangıç', color: '#64748b' };
    var n = parseFloat(avg);
    if (isNaN(n)) return { icon: '⭐', title: 'Başlangıç', color: '#64748b' };
    if (n >= 90) return { icon: '🏆', title: 'Fen Ustası', color: '#f59e0b' };
    if (n >= 80) return { icon: '🥇', title: 'Bilim İnsanı', color: '#eab308' };
    if (n >= 70) return { icon: '🥈', title: 'Araştırmacı', color: '#94a3b8' };
    if (n >= 50) return { icon: '🥉', title: 'Meraklı', color: '#d97706' };
    return { icon: '🌱', title: 'Gelişiyor', color: '#10b981' };
}

function openStudentPlusMinus(grade, branch) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student && currentStudentContext.student) student = currentStudentContext.student;
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    if (!window._skipHistory) saveState({ type: "plus-minus", grade: grade, branch: branch, student: student });

    var panel = document.getElementById('student-panel');
    var plus = student.plus || 0;
    var minus = student.minus || 0;
    var total = plus - minus;

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Puanlarım</h1></div>' +
            '<div>' +
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:600px;margin:0 auto;">' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" style="border-top-color:#10b981;text-align:center;">' +
                    '<div style="font-size:36px;">➕</div>' +
                    '<h3 style="font-size:28px;color:#10b981;margin:8px 0;">' + plus + '</h3>' +
                    '<p>Artı Puan</p>' +
                '</div>' +
                '<div class="grade-card" style="border-top-color:#ef4444;text-align:center;">' +
                    '<div style="font-size:36px;">➖</div>' +
                    '<h3 style="font-size:28px;color:#ef4444;margin:8px 0;">' + minus + '</h3>' +
                    '<p>Eksi Puan</p>' +
                '</div>' +
                '<div class="grade-card" style="border-top-color:#3b82f6;text-align:center;grid-column:1/-1;">' +
                    '<div style="font-size:36px;">⚖️</div>' +
                    '<h3 style="font-size:28px;color:#3b82f6;margin:8px 0;">' + total + '</h3>' +
                    '<p>Net Puan</p>' +
                '</div>' +
            '</div>' +
        '</section>';
}

function openStudentQuizResults(grade, branch) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student && currentStudentContext.student) student = currentStudentContext.student;
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    saveState({ type: "quiz-results", grade: grade, branch: branch, student: student });
    var panel = document.getElementById('student-panel');

    var units = fenData[grade]?.units || [];
    var rows = '';
    var qSum = 0, qCnt = 0;

    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var key = u.name + '_' + sec;
            if (student.quiz && student.quiz[key] !== undefined && student.quiz[key] !== '') {
                var sc = student.quiz[key];
                rows += '<tr><td style="text-align:left;"><b>' + u.name + '</b><br><span style="font-size:12px;color:#94a3b8;">' + sec + '</span></td><td>' + getScoreBadge(sc) + '</td></tr>';
                if (sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) { qSum += num; qCnt++; }
                }
            }
        });
    });

    var avg = qCnt ? Math.round(qSum / qCnt) : '-';

    // Grafik verisi
    var chartLabels = [];
    var chartValues = [];
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var key = u.name + '_' + sec;
            if (student.quiz && student.quiz[key] !== undefined && student.quiz[key] !== '') {
                var sc = student.quiz[key];
                if (sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) {
                        var short = sec.length > 14 ? sec.substring(0, 12) + '...' : sec;
                        chartLabels.push(short);
                        chartValues.push(num);
                    }
                }
            }
        });
    });
    var chartHtml = generateSimpleChart(chartLabels, chartValues, 'Quiz Gelişim Grafiği');

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Quiz Sonuçları</h1></div>' +
            '<div>' +
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:800px;margin:0 auto;">' +
            '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
                '<button onclick="exportTableToWord(\'quiz-print\',\'' + student.name.replace(/'/g,"") + '_Quiz\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#2563eb;">Word</button>' +
                '<button onclick="exportTableToPDF(\'quiz-print\',\'' + student.name.replace(/'/g,"") + '_Quiz\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#dc2626;">PDF</button>' +
            '</div>' +
            '<div id="quiz-print" class="print-area">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
                '<div style="background:rgba(30,41,59,0.7);padding:10px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;">' +
                    '<span style="font-size:28px;">' + getFenBadge(avg).icon + '</span>' +
                    '<div><p style="font-size:13px;margin:0;"><b>Ortalama:</b> ' + getScoreBadge(avg) + '</p>' +
                    '<p style="font-size:12px;color:' + getFenBadge(avg).color + ';margin:2px 0 0;">' + getFenBadge(avg).title + '</p></div>' +
                '</div>' +
            '</div>' +
            chartHtml +
            '<table class="data-table">' +
                '<thead><tr><th style="text-align:left;">Ünite / Bölüm</th><th>Not</th></tr></thead>' +
                '<tbody>' + (rows || '<tr><td colspan="2">Henüz quiz sonucu yok</td></tr>') + '</tbody>' +
            '</table>' +
            '</div>' +
        '</section>';
}

// ====================== ÖĞRENCİ - ETKİNLİK SONUÇLARI ======================
function openStudentActivityResults(grade, branch) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student && currentStudentContext.student) student = currentStudentContext.student;
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    saveState({ type: "activity-results", grade: grade, branch: branch, student: student });
    var panel = document.getElementById('student-panel');

    var units = fenData[grade]?.units || [];
    var rows = '';
    var sSum = 0, sCnt = 0;

    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var acts = (fenData[grade]?.activities || []).filter(function(a) {
                return a.unit === u.name && a.section === sec;
            });
            var activityGroups = {};
            acts.forEach(function(a) {
                var baseName = a.name;
                if (baseName.indexOf(' - ') >= 0) {
                    var parts = baseName.split(' - ');
                    if (parts.length >= 2) baseName = parts[0] + ' - ' + parts[1];
                }
                if (!activityGroups[baseName]) {
                    activityGroups[baseName] = { scores: [], unit: u.name, section: sec };
                }
                var sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== '' && sc !== null && sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) activityGroups[baseName].scores.push(num);
                }
            });
            Object.keys(activityGroups).forEach(function(baseName) {
                var group = activityGroups[baseName];
                if (group.scores.length === 0) return;
                var avg = Math.round(group.scores.reduce(function(a,b){return a+b;},0) / group.scores.length);
                rows += '<tr>' +
                    '<td style="text-align:left;line-height:1.35;padding:8px 6px;">' +
                        '<b style="font-size:13px;">' + group.unit + '</b><br>' +
                        '<span style="font-size:12px;color:#94a3b8;">' + group.section + '</span><br>' +
                        '<span style="font-size:12px;color:#60a5fa;">' + baseName + '</span>' +
                    '</td>' +
                    '<td>' + getScaleBadge(avg) + '</td>' +
                '</tr>';
                sSum += avg; sCnt++;
            });
        });
    });

    var sAvg = sCnt ? Math.round(sSum / sCnt) : '-';

    // Grafik verisi (etkinlik)
    var chartLabels = [];
    var chartValues = [];
    units.forEach(function(u) {
        (u.sections || []).forEach(function(sec) {
            var acts = (fenData[grade]?.activities || []).filter(function(a) {
                return a.unit === u.name && a.section === sec;
            });
            var activityGroups = {};
            acts.forEach(function(a) {
                var baseName = a.name;
                if (baseName.indexOf(' - ') >= 0) {
                    var parts = baseName.split(' - ');
                    if (parts.length >= 2) baseName = parts[0] + ' - ' + parts[1];
                }
                if (!activityGroups[baseName]) activityGroups[baseName] = { scores: [] };
                var sc = student.scale?.[a.name]?.totalScore;
                if (sc !== undefined && sc !== '' && sc !== null && sc !== 'G') {
                    var num = parseFloat(sc);
                    if (!isNaN(num)) activityGroups[baseName].scores.push(num);
                }
            });
            Object.keys(activityGroups).forEach(function(baseName) {
                var group = activityGroups[baseName];
                if (group.scores.length === 0) return;
                var avg = Math.round(group.scores.reduce(function(a,b){return a+b;},0) / group.scores.length);
                var short = baseName.length > 16 ? baseName.substring(0, 14) + '...' : baseName;
                chartLabels.push(short);
                chartValues.push(avg);
            });
        });
    });
    var chartHtml = generateSimpleChart(chartLabels, chartValues, 'Etkinlik Gelişim Grafiği');

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Etkinlik Sonuçları</h1></div>' +
            '<div>' +
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:800px;margin:0 auto;">' +
            '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
                '<button onclick="exportTableToWord(\'activity-print\',\'' + student.name.replace(/'/g,"") + '_Etkinlik\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#2563eb;">Word</button>' +
                '<button onclick="exportTableToPDF(\'activity-print\',\'' + student.name.replace(/'/g,"") + '_Etkinlik\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#dc2626;">PDF</button>' +
            '</div>' +
            '<div id="activity-print" class="print-area">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
                '<div style="background:rgba(30,41,59,0.7);padding:10px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;">' +
                    '<span style="font-size:28px;">' + getFenBadge(sCnt ? sAvg : '-').icon + '</span>' +
                    '<div><p style="font-size:13px;margin:0;"><b>Ortalama:</b> ' + (sCnt ? getScaleBadge(sAvg) : '-') + '</p>' +
                    '<p style="font-size:12px;color:' + getFenBadge(sCnt ? sAvg : '-').color + ';margin:2px 0 0;">' + getFenBadge(sCnt ? sAvg : '-').title + '</p></div>' +
                '</div>' +
            '</div>' +
            chartHtml +
            '<table class="data-table">' +
                '<thead><tr><th style="text-align:left;">Ünite / Bölüm / Etkinlik</th><th>Ort</th></tr></thead>' +
                '<tbody>' + (rows || '<tr><td colspan="2">Henüz etkinlik sonucu yok</td></tr>') + '</tbody>' +
            '</table>' +
            '</div>' +
        '</section>';
}

// ====================== ÖĞRENCİ - DERS SİSTEMİ ======================
let currentStudentContext = { grade: null, branch: null, student: null };

function openStudentLessons(grade, branch) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student && currentStudentContext.student) student = currentStudentContext.student;
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    saveState({ type: "student-lessons", grade: grade, branch: branch, student: student });
    currentStudentContext = { grade: grade, branch: branch, student: student };

    var panel = document.getElementById('student-panel');
    var units = fenData[grade]?.units || [];
    // Tekrarlayan üniteleri temizle
    var seen = {};
    units = units.filter(function(u) {
        if (seen[u.name]) return false;
        seen[u.name] = true;
        return true;
    });
    var lessons = fenData[grade]?.lessons || [];

    var unitCards = '';
    units.forEach(function(u) {
        var count = lessons.filter(function(l) { return l.unit === u.name; }).length;
        unitCards += '<div class="grade-card" onclick="openStudentUnit(\'' + grade + '\',\'' + branch + '\',\'' + u.name.replace(/'/g, "\\'") + '\')" style="border-top-color:#3b82f6;">' +
            '<h3>' + u.name + '</h3>' +
            '<p>' + count + ' içerik</p>' +
            '<span class="card-action">Gir →</span>' +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Ders</h1></div>' +
            '<div>' +
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\',' + JSON.stringify(student).replace(/"/g,'&quot;') + ',false)" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px;margin:0 auto;">' +
            '<h3 style="margin-bottom:14px;font-size:15px;color:#94a3b8;">Üniteler</h3>' +
            '<div class="grade-cards-grid">' + (unitCards || '<p style="color:#64748b;">Henüz ünite yok.</p>') + '</div>' +
        '</section>';
}

async function openStudentUnit(grade, branch, unitName) {
    saveState({ type: "student-unit", grade: grade, branch: branch, unitName: unitName, student: currentStudentContext.student });
    var student = currentStudentContext.student;
    var panel = document.getElementById('student-panel');
    var unit = (fenData[grade]?.units || []).find(function(u) { return u.name === unitName; });
    if (!unit) return;

    var lessons = (fenData[grade]?.lessons || []).filter(function(l) { return l.unit === unitName; });
    var sectionCards = '';

    for (var i = 0; i < (unit.sections || []).length; i++) {
        var sec = unit.sections[i];
        var secLessons = lessons.filter(function(l) { return l.section === sec; });
        var progress = await getStudentSectionProgress(student.id, grade, unitName, sec);
        sectionCards += '<div class="grade-card" onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sec.replace(/'/g,"\\'") + '\')" style="border-top-color:#06b6d4;">' +
            '<h3>' + sec + '</h3>' +
            '<p>' + secLessons.length + ' içerik</p>' +
            '<div class="progress-text">İlerleme: %' + progress + '</div>' +
            '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + progress + '%"></div></div>' +
            '<span class="card-action">Gir →</span>' +
        '</div>';
    }

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + unitName + '</h1></div>' +
            '<div>' +
                '<button onclick="openStudentLessons(\'' + grade + '\',\'' + branch + '\')" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px;margin:0 auto;">' +
            '<h3 style="margin-bottom:14px;font-size:15px;color:#94a3b8;">Bölümler</h3>' +
            '<div class="grade-cards-grid">' + (sectionCards || '<p style="color:#64748b;">Henüz bölüm yok.</p>') + '</div>' +
        '</section>';
}

async function getStudentSectionProgress(studentId, grade, unit, section) {
    if (!supabaseClient || !studentId) return 0;
    try {
        var { data } = await supabaseClient.rpc('get_section_progress', {
            p_student_id: studentId,
            p_grade: grade,
            p_unit: unit,
            p_section: section
        });
        return data || 0;
    } catch(e) {
        var lessons = (fenData[grade]?.lessons || []).filter(function(l) {
            return l.unit === unit && l.section === section;
        });
        if (lessons.length === 0) return 0;
        var { data: progressRows } = await supabaseClient
            .from('student_progress')
            .select('content_id')
            .eq('student_id', studentId)
            .eq('is_completed', true);
        var completedIds = (progressRows || []).map(function(r) { return r.content_id; });
        var completed = lessons.filter(function(l) { return completedIds.indexOf(l.id) >= 0; }).length;
        return Math.round((completed / lessons.length) * 100);
    }
}

async function openStudentSection(grade, branch, unitName, sectionName) {
    saveState({ type: "student-section", grade: grade, branch: branch, unitName: unitName, sectionName: sectionName, student: currentStudentContext.student });
    var student = currentStudentContext.student;
    var panel = document.getElementById('student-panel');
    var lessons = (fenData[grade]?.lessons || []).filter(function(l) {
        return l.unit === unitName && l.section === sectionName;
    });

    var progress = await getStudentSectionProgress(student.id, grade, unitName, sectionName);

    var completedIds = [];
    if (supabaseClient && student.id) {
        var { data: prog } = await supabaseClient
            .from('student_progress')
            .select('content_id')
            .eq('student_id', student.id)
            .eq('is_completed', true);
        completedIds = (prog || []).map(function(r) { return r.content_id; });
    }

    // Sıralı kilit sistemi: Video → Slayt → Deney → Quiz
    var typeOrder = ['video', 'pptx', 'experiment', 'quiz'];
    var typeLabels = {
        video: 'Bölüm Videosu',
        pptx: 'Bölüm Anlatımı Slayt',
        experiment: 'Bölüm Deneyi',
        quiz: 'Bölüm Quizi'
    };
    var typeColors = {
        video: '#0891b2',
        pptx: '#7c3aed',
        experiment: '#059669',
        quiz: '#d97706'
    };
    var typeReq = {
        video: null,
        pptx: 'video',
        experiment: 'pptx',
        quiz: 'experiment'
    };

    var cards = '';
    var icons = { video: '🎬', pptx: '📄', experiment: '🔬', quiz: '📝' };
    typeOrder.forEach(function(t) {
        var items = lessons.filter(function(l) { return l.type === t; });
        if (items.length === 0) return;

        var plural = { video: 'Videolar', pptx: 'Slaytlar', experiment: 'Deneyler', quiz: 'Quizler' };
        var label = plural[t] || typeLabels[t];
        var icon = icons[t] || '🔬';

        cards += '<div class="grade-card" onclick="openContentList(\'' + t + '\',\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sectionName.replace(/'/g,"\\'") + '\')" style="border-top-color:' + typeColors[t] + ';">' +
            '<div style="font-size:28px;margin-bottom:6px;">' + icon + '</div>' +
            '<h3 style="font-size:15px;">' + label + '</h3>' +
            '<p style="font-size:12px;color:#94a3b8;">' + items.length + ' içerik</p>' +
            '<span class="card-action">Listele</span>' +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + sectionName + '</h1></div>' +
            '<div>' +
                '<button onclick="openStudentUnit(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\')" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px;margin:0 auto;">' +
            '<div style="margin-bottom:16px;">' +
                '<div class="progress-text">Bölüm İlerlemesi: %' + progress + '</div>' +
                '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + progress + '%"></div></div>' +
            '</div>' +
            '<div class="grade-cards-grid">' + (cards || '<p style="color:#64748b;">Bu bölümde henüz içerik yok.</p>') + '</div>' +
        '</section>';
}

async function openContentList(type, grade, branch, unitName, sectionName) {
    saveState({ type: "content-list", contentType: type, grade: grade, branch: branch, unitName: unitName, sectionName: sectionName });
    var panel = document.getElementById('student-panel');
    var lessons = (fenData[grade]?.lessons || []).filter(function(l) {
        return l.unit === unitName && l.section === sectionName && l.type === type;
    });

    // Tamamlananları çek
    var completedIds = [];
    var student = currentStudentContext.student;
    if (supabaseClient && student && student.id) {
        var { data: prog } = await supabaseClient
            .from('student_progress')
            .select('content_id')
            .eq('student_id', student.id)
            .eq('is_completed', true);
        completedIds = (prog || []).map(function(r) { return r.content_id; });
    }

    var typeNames = { video: 'Videolar', pptx: 'Slaytlar', experiment: 'Deneyler', quiz: 'Quizler' };
    var typeColors = { video: '#0891b2', pptx: '#7c3aed', experiment: '#059669', quiz: '#d97706' };
    var title = typeNames[type] || 'İçerikler';
    var color = typeColors[type] || '#3b82f6';

    var cards = '';
    lessons.forEach(function(l, idx) {
        var isDone = completedIds.indexOf(l.id) >= 0;
        // Sıralı kilit: önceki tamamlanmadıysa kilitle
        var locked = false;
        if (idx > 0) {
            var prev = lessons[idx - 1];
            if (completedIds.indexOf(prev.id) < 0) locked = true;
        }
        var safeId = String(l.id).replace(/'/g, "");
        var onclick = locked ? '' : 'onclick="openContentViewer(\'' + safeId + '\',\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sectionName.replace(/'/g,"\\'") + '\')"';
        var style = locked ? 'opacity:0.5;cursor:not-allowed;' : '';
        var badge = locked ? '<span style="font-size:11px;color:#f87171;">Kilitli</span>' : (isDone ? '<span class="btn-completed" style="font-size:11px;">✓</span>' : '');

        cards += '<div class="grade-card" ' + onclick + ' style="border-top-color:' + color + ';' + style + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<h3 style="font-size:15px;margin:0;">' + (idx+1) + '. ' + (l.title || title) + '</h3>' +
                badge +
            '</div>' +
            (locked ? '<span class="card-action" style="color:#64748b;">Önceki bitmeden açılamaz</span>' : '<span class="card-action">Aç →</span>') +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + title + '</h1></div>' +
            '<div>' +
                '<button onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sectionName.replace(/'/g,"\\'") + '\')" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px;margin:0 auto;">' +
            '<div class="grade-cards-grid">' + (cards || '<p style="color:#64748b;">İçerik bulunamadı.</p>') + '</div>' +
        '</section>';
}

// YouTube IFrame API
var ytPlayer = null;
var ytProgressInterval = null;

function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    return new Promise(function(resolve) {
        if (document.getElementById('yt-api')) return resolve();
        var tag = document.createElement('script');
        tag.id = 'yt-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = function() { resolve(); };
    });
}

async function initYouTubePlayer(videoId, contentId, grade, branch, unitName, sectionName) {
    await loadYouTubeAPI();
    var container = document.getElementById('yt-player');
    if (!container) return;
    container.innerHTML = '<div id="yt-inner"></div>';
    ytPlayer = new YT.Player('yt-inner', {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
            onReady: function() {
                startYouTubeProgress(contentId, grade, branch, unitName, sectionName);
            }
        }
    });
}

function startYouTubeProgress(contentId, grade, branch, unitName, sectionName) {
    if (ytProgressInterval) clearInterval(ytProgressInterval);
    var maxPercent = 0;
    ytProgressInterval = setInterval(function() {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        try {
            var current = ytPlayer.getCurrentTime() || 0;
            var duration = ytPlayer.getDuration() || 1;
            var percent = Math.min(100, Math.round((current / duration) * 100));
            if (percent > maxPercent) maxPercent = percent;
            var fill = document.querySelector('.progress-bar-fill');
            if (fill) fill.style.width = maxPercent + '%';
            var txt = document.querySelector('.progress-text');
            if (txt) txt.textContent = 'İlerleme: %' + maxPercent;
            // %90 ve üzeri izlendiyse tamamla
            if (maxPercent >= 90) {
                clearInterval(ytProgressInterval);
                markContentCompleted(contentId, grade, branch, unitName, sectionName);
            }
        } catch(e) {}
    }, 2000);
}

function nextSlide(contentId, grade, branch, unitName, sectionName, total) {
    window.currentSlide = (window.currentSlide || 1) + 1;
    if (window.currentSlide > total) window.currentSlide = total;
    var info = document.getElementById('slide-info');
    if (info) info.textContent = 'Slayt ' + window.currentSlide + ' / ' + total;
    var pct = Math.round((window.currentSlide / total) * 100);
    var bar = document.getElementById('slide-progress');
    if (bar) bar.style.width = pct + '%';
    if (window.currentSlide >= total) {
        var btn = document.getElementById('next-slide-btn');
        if (btn) btn.textContent = 'Tamamlandı';
        markContentCompleted(contentId, grade, branch, unitName, sectionName);
    }
}

function openContentViewer(contentId, grade, branch, unitName, sectionName) {
    var lesson = (fenData[grade]?.lessons || []).find(function(l) { return l.id === contentId; });
    if (!lesson) return alert('İçerik bulunamadı');

    try {
        history.pushState({ type: 'content-view', contentId: contentId, grade: grade, branch: branch, unitName: unitName, sectionName: sectionName }, '', '#content');
    } catch(e){}

    var panel = document.getElementById('student-panel');
    var iframeHeight = 'calc(100vh - 180px)';
    var body = '';

    if (lesson.type === 'pptx' && lesson.file_url) {
        var vUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(lesson.file_url);
        var totalSlides = 10;
        if (lesson.description && lesson.description.indexOf('slides:') === 0) {
            totalSlides = parseInt(lesson.description.split(':')[1]) || 10;
        }
        body = '<iframe src="' + vUrl + '" style="width:100%;height:' + iframeHeight + ';border:none;border-radius:10px;background:#0f172a;" allowfullscreen></iframe>';
    } else if (lesson.type === 'pdf' && lesson.file_url) {
        body = '<iframe src="' + lesson.file_url + '#toolbar=1" style="width:100%;height:' + iframeHeight + ';border:none;border-radius:10px;background:#0f172a;" allowfullscreen></iframe>';
    } else if (lesson.type === 'experiment' && lesson.experiment_url) {
        body = '<iframe class="experiment-frame" src="' + lesson.experiment_url + '" style="height:' + iframeHeight + ';" allowfullscreen></iframe>';
    } else if (lesson.type === 'video' && lesson.file_url) {
        var ytMatch = lesson.file_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            body = '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#000;">' +
                '<iframe src="https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>';
        } else {
            body = '<a href="' + lesson.file_url + '" target="_blank" class="auth-btn">Videoyu Aç</a>';
        }
    } else if (lesson.type === 'quiz') {
        startStudentQuiz(contentId);
        return;
    } else {
        body = '<p style="color:#94a3b8;">İçerik açılamadı.</p>';
    }

    var safeUnit = unitName.replace(/'/g, "\\'");
    var safeSec = sectionName.replace(/'/g, "\\'");

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + (lesson.title || 'İçerik') + '</h1></div>' +
            '<div>' +
                '<button onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + safeUnit + '\',\'' + safeSec + '\')" class="logout-btn" style="background:#3b82f6;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:1100px;margin:0 auto;padding:12px;">' +
            '<div style="margin-bottom:10px;">' + getContentTypeBadge(lesson.type) + '</div>' +
            body +
            (lesson.type === 'video'
                ? '<div style="margin-top:16px;text-align:center;">' +
                    '<div class="progress-text">İlerleme</div>' +
                    '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:0%"></div></div>' +
                    '<p style="font-size:12px;color:#64748b;margin-top:8px;">%90 izlenince otomatik tamamlanır.</p>' +
                  '</div>'
                : lesson.type === 'pptx'
                ? '<div style="margin-top:8px;text-align:center;">' +
                    '<div class="progress-text">Slayt İlerlemesi</div>' +
                    '<div class="progress-bar-container"><div class="progress-bar-fill" id="slide-progress" style="width:0%"></div></div>' +
                  '</div>'
                : '<div style="margin-top:16px;text-align:center;">' +
                    '<div class="progress-text">İlerleme</div>' +
                    '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:30%"></div></div>' +
                    '<button onclick="markContentCompleted(\'' + contentId + '\',\'' + grade + '\',\'' + branch + '\',\'' + safeUnit + '\',\'' + safeSec + '\')" class="auth-btn" style="width:auto;padding:10px 20px;background:#059669;margin-top:12px;">Tamamladım (Sonraki Açılır)</button>' +
                  '</div>') +
        '</section>';

}

function renderContentBody(lesson) {
    var id = lesson.id || Math.random().toString(36).substr(2,6);
    if (lesson.type === 'pptx' || lesson.type === 'pdf') {
        if (!lesson.file_url) return '<span style="color:#94a3b8;font-size:13px;">Dosya yok</span>';
        var label = lesson.type === 'pptx' ? 'Sunuyu Aç' : 'PDF\'i Aç';
        var viewer = '';
        if (lesson.type === 'pptx') {
            var vUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(lesson.file_url);
            viewer = '<iframe src="' + vUrl + '" style="width:100%;height:520px;border:none;border-radius:10px;background:#0f172a;" allowfullscreen></iframe>';
        } else {
            viewer = '<iframe src="' + lesson.file_url + '#toolbar=1" style="width:100%;height:520px;border:none;border-radius:10px;background:#0f172a;" allowfullscreen></iframe>';
        }
        return '<div>' +
            '<button onclick="toggleContentViewer(\'' + id + '\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#3b82f6;margin-bottom:8px;">' + label + '</button>' +
            '<div id="viewer-' + id + '" style="display:none;margin-top:8px;">' + viewer +
                '<div style="margin-top:8px;"><a href="' + lesson.file_url + '" target="_blank" class="auth-btn" style="width:auto;padding:6px 12px;background:#475569;display:inline-block;text-decoration:none;">İndir</a></div>' +
            '</div></div>';
    }
    if (lesson.type === 'video') {
        if (!lesson.file_url) return '<span style="color:#94a3b8;font-size:13px;">Video URL yok</span>';
        var ytMatch = lesson.file_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            return '<div>' +
                '<button onclick="toggleContentViewer(\'' + id + '\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#0891b2;margin-bottom:8px;">Videoyu Aç</button>' +
                '<div id="viewer-' + id + '" style="display:none;margin-top:8px;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;">' +
                    '<iframe src="https://www.youtube.com/embed/' + ytMatch[1] + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe>' +
                '</div></div>';
        }
        return '<a href="' + lesson.file_url + '" target="_blank" class="auth-btn" style="width:auto;padding:8px 14px;display:inline-block;text-decoration:none;">Videoyu Aç</a>';
    }
    if (lesson.type === 'experiment') {
        if (!lesson.experiment_url) return '<span style="color:#94a3b8;font-size:13px;">Deney URL yok</span>';
        return '<div>' +
            '<button onclick="toggleContentViewer(\'' + id + '\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#059669;margin-bottom:8px;">Deneyi Aç</button>' +
            '<div id="viewer-' + id + '" style="display:none;margin-top:8px;">' +
                '<iframe class="experiment-frame" src="' + lesson.experiment_url + '" allowfullscreen></iframe>' +
            '</div></div>';
    }
    if (lesson.type === 'quiz') {
        return '<button onclick="startStudentQuiz(\'' + lesson.id + '\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#d97706;">Quiz\'i Çöz</button>';
    }
    return '';
}

function toggleContentViewer(id) {
    var el = document.getElementById('viewer-' + id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function markContentCompleted(contentId, grade, branch, unitName, sectionName) {
    var student = currentStudentContext.student;
    if (!student || !student.id) return alert('Öğrenci bilgisi eksik');

    if (supabaseClient) {
        await supabaseClient.from('student_progress').upsert({
            student_id: student.id,
            grade: grade,
            branch: branch,
            school_no: student.no,
            content_id: contentId,
            is_completed: true,
            completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,content_id' });
    }
    openStudentSection(grade, branch, unitName, sectionName);
}

// ====================== ONLINE QUIZ ÇÖZME ======================
let currentQuizState = null;

function startStudentQuiz(contentId) {
    var grade = currentStudentContext.grade;
    var lesson = (fenData[grade]?.lessons || []).find(function(l) { return l.id === contentId; });
    if (!lesson || !lesson.quiz_data || lesson.quiz_data.length === 0) {
        return alert('Bu quiz için soru bulunamadı. Öğretmen Word dosyasını kontrol etsin.');
    }

    currentQuizState = {
        contentId: contentId,
        questions: lesson.quiz_data,
        answers: {},
        currentIndex: 0,
        startTime: Date.now()
    };

    renderQuizScreen();
}

function renderQuizScreen() {
    var panel = document.getElementById('student-panel');
    var qs = currentQuizState.questions;
    var idx = currentQuizState.currentIndex;
    var q = qs[idx];
    var total = qs.length;

    if (!q) {
        submitQuiz();
        return;
    }

    // Yapışık şıkları anında ayır
    var opts = q.options || [];
    if (opts.length <= 1) {
        var raw = (opts[0] ? (opts[0].key + ') ' + opts[0].text) : '') || q.question || '';
        var parts = raw.split(/([A-D])[\.\)\-\:]\s*/i);
        var fixed = [];
        for (var i = 1; i < parts.length; i += 2) {
            var k = (parts[i] || '').toUpperCase();
            var t = (parts[i+1] || '').trim();
            if (k && /[A-D]/.test(k)) fixed.push({ key: k, text: t });
        }
        if (fixed.length >= 2) {
            opts = fixed;
            // Soru metnini de düzelt
            var pos = raw.search(/[A-D][\.\)\-\:]/);
            if (pos > 0 && !q.question) q.question = raw.substring(0, pos).trim();
        }
    }

    var optionsHtml = '';
    opts.forEach(function(opt) {
        var selected = currentQuizState.answers[idx] === opt.key ? ' selected' : '';
        optionsHtml += '<div class="quiz-option' + selected + '" onclick="selectQuizAnswer(' + idx + ',\'' + opt.key + '\')">' +
            '<strong>' + opt.key + ')</strong> ' + (opt.text || '') +
        '</div>';
    });

    var isLast = idx === total - 1;
    var hasAnswer = !!currentQuizState.answers[idx];

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Quiz (' + (idx+1) + ' / ' + total + ')</h1></div>' +
            '<button onclick="cancelQuiz()" class="logout-btn" style="background:#475569;">İptal</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:700px;margin:0 auto;">' +
            '<div class="progress-bar-container" style="margin-bottom:16px;">' +
                '<div class="progress-bar-fill" style="width:' + Math.round(((idx) / total) * 100) + '%"></div>' +
            '</div>' +
            '<div class="quiz-question">' +
                '<div style="font-weight:600;margin-bottom:14px;font-size:15px;">' + (idx+1) + '. ' + q.question + '</div>' +
                optionsHtml +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:20px;justify-content:space-between;">' +
                (idx > 0 ? '<button onclick="prevQuizQuestion()" class="auth-btn" style="width:auto;padding:10px 18px;background:#475569;">← Önceki</button>' : '<div></div>') +
                (isLast
                    ? '<button onclick="submitQuiz()" class="auth-btn" style="width:auto;padding:10px 18px;background:#059669;" ' + (!hasAnswer ? 'disabled' : '') + '>Quiz\'i Bitir</button>'
                    : '<button onclick="nextQuizQuestion()" class="auth-btn" style="width:auto;padding:10px 18px;background:#3b82f6;" ' + (!hasAnswer ? 'disabled' : '') + '>Sonraki →</button>') +
            '</div>' +
        '</section>';
}

function selectQuizAnswer(qIndex, key) {
    currentQuizState.answers[qIndex] = key;
    renderQuizScreen();
}

function nextQuizQuestion() {
    if (currentQuizState.currentIndex < currentQuizState.questions.length - 1) {
        currentQuizState.currentIndex++;
        renderQuizScreen();
    }
}

function prevQuizQuestion() {
    if (currentQuizState.currentIndex > 0) {
        currentQuizState.currentIndex--;
        renderQuizScreen();
    }
}

function cancelQuiz() {
    currentQuizState = null;
    var ctx = currentStudentContext;
    openStudentLessons(ctx.grade, ctx.branch);
}

async function submitQuiz() {
    if (!currentQuizState) return;
    var student = currentStudentContext.student;
    var qs = currentQuizState.questions;
    var correct = 0;
    qs.forEach(function(q, i) {
        if (q.correct && currentQuizState.answers[i] === q.correct) correct++;
    });
    var total = qs.length;
    var score = total ? Math.round((correct / total) * 100) : 0;
    var timeSpent = Math.round((Date.now() - currentQuizState.startTime) / 1000);

    if (supabaseClient && student.id) {
        await supabaseClient.from('quiz_results').insert([{
            student_id: student.id,
            content_id: currentQuizState.contentId,
            grade: currentStudentContext.grade,
            branch: currentStudentContext.branch,
            school_no: student.no,
            answers: currentQuizState.answers,
            correct_count: correct,
            total_questions: total,
            score: score,
            time_spent_seconds: timeSpent,
            is_finished: true,
            finished_at: new Date().toISOString()
        }]);

        await supabaseClient.from('student_progress').upsert({
            student_id: student.id,
            grade: currentStudentContext.grade,
            branch: currentStudentContext.branch,
            school_no: student.no,
            content_id: currentQuizState.contentId,
            is_completed: true,
            completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,content_id' });
    }

    // Optik sonuç ekranı göster
    showQuizResults(currentQuizState, correct, total, score);
}

function showQuizResults(state, correct, total, score) {
    var panel = document.getElementById('student-panel');
    var qs = state.questions || [];
    var html = '';
    qs.forEach(function(q, i) {
        var userAns = state.answers[i] || '-';
        var isCorrect = q.correct && userAns === q.correct;
        var color = isCorrect ? '#166534' : '#991b1b';
        var bg = isCorrect ? 'rgba(22,101,52,0.2)' : 'rgba(153,27,27,0.2)';
        var border = isCorrect ? '#16a34a' : '#dc2626';
        html += '<div class="quiz-question" style="border-left:4px solid ' + border + ';background:' + bg + ';cursor:pointer;" onclick="toggleQuizDetail(' + i + ')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-weight:600;">' + (i+1) + '. ' + (q.question || '').substring(0, 80) + (q.question && q.question.length > 80 ? '...' : '') + '</div>' +
                '<div style="font-size:13px;font-weight:700;color:' + (isCorrect ? '#86efac' : '#fca5a5') + ';">' +
                    (isCorrect ? '✓ Doğru' : '✗ Yanlış') +
                '</div>' +
            '</div>' +
            '<div id="qdetail-' + i + '" style="display:none;margin-top:10px;font-size:13px;color:#cbd5e1;">' +
                '<div><b>Senin cevabın:</b> ' + userAns + '</div>' +
                '<div><b>Doğru cevap:</b> ' + (q.correct || '-') + '</div>' +
                (q.options && q.options.length ? '<div style="margin-top:6px;">' + q.options.map(function(o){ return o.key + ') ' + o.text; }).join('<br>') + '</div>' : '') +
            '</div>' +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Quiz Sonucu</h1></div>' +
            '<button onclick="openStudentLessons(currentStudentContext.grade, currentStudentContext.branch)" class="logout-btn" style="background:#3b82f6;">Geri</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:800px;margin:0 auto;">' +
            '<div style="background:rgba(30,41,59,0.7);padding:16px;border-radius:12px;margin-bottom:16px;text-align:center;">' +
                '<div style="font-size:28px;font-weight:700;color:#f8fafc;">%' + score + '</div>' +
                '<div style="font-size:14px;color:#94a3b8;margin-top:4px;">Doğru: ' + correct + ' / ' + total + '</div>' +
            '</div>' +
            '<h3 style="margin-bottom:12px;font-size:15px;color:#94a3b8;">Soru Soru Sonuç</h3>' +
            html +
        '</section>';
    currentQuizState = null;
}

function toggleQuizDetail(idx) {
    var el = document.getElementById('qdetail-' + idx);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ====================== ŞUBE DETAY (Öğrenci Listesi) ======================
function openBranchDetail(grade, branchName, tab, push) {
    if (push !== false) saveState({ type: 'branch-detail', grade: grade, branchName: branchName, tab: tab });
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sınıf - ' + branchName + '</h1></div>' +
            '<div>' +
                '<button onclick="openBranchMenu(\'' + grade + '\',\'' + branchName + '\', false)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Menü</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<div id="branch-tab-content" style="background:rgba(30,41,59,0.7); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);"></div>' +
        '</section>';
    loadBranchTabContent(tab, grade, branchName);
}

function loadBranchTabContent(tab, grade, branchName) {
    var content = document.getElementById('branch-tab-content');
    if (!content) return;

    if (tab === 'students') {
        var students = fenData[grade]?.branches[branchName] || [];
        var rows = '';
        students.forEach(function(s, idx) {
            rows += '<tr>' +
                '<td style="white-space:nowrap;">' + s.no + '</td>' +
                '<td style="white-space:nowrap; text-align:left; min-width:150px;">' + s.name + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-pastel-green" onclick="updatePoint(\'' + grade + '\',\'' + branchName + '\',' + idx + ',\'plus\')">+</button>' +
                    '<span style="margin:0 6px; font-weight:600;">' + s.plus + '</span>' +
                '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-pastel-red" onclick="updatePoint(\'' + grade + '\',\'' + branchName + '\',' + idx + ',\'minus\')">-</button>' +
                    '<span style="margin:0 6px; font-weight:600;">' + s.minus + '</span>' +
                '</td>' +
                '<td><button class="btn-pastel-gray" onclick="deleteStudent(\'' + grade + '\',\'' + branchName + '\',' + idx + ')">Sil</button></td>' +
            '</tr>';
        });
        content.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">' +
                '<h3 style="margin:0; font-size:15px;">Öğrenci Listesi</h3>' +
                '<div style="display:flex; gap:6px;">' +
                    '<button onclick="addStudentModal(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:6px 10px; background:#2563eb; font-size:12px;">+ Öğrenci</button>' +
                '</div>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
                '<table class="data-table" id="export-students">' +
                    '<thead><tr><th>No</th><th>Ad Soyad</th><th>Artı</th><th>Eksi</th><th>İşlem</th></tr></thead>' +
                    '<tbody>' + (rows || '<tr><td colspan="5">Öğrenci yok</td></tr>') + '</tbody>' +
                '</table>' +
            '</div>';
    } else if (tab === 'quizzes') {
        var units = fenData[grade]?.units || [];
        var unitOpts = '<option value="">-- Ünite Seçin --</option>';
        units.forEach(function(u) { unitOpts += '<option value="' + u.name + '">' + u.name + '</option>'; });
        content.innerHTML = '<h3 style="margin:0 0 12px;font-size:15px;">Quiz Sonuçları</h3>' +
            '<select id="quiz-unit-sel" class="auth-input" onchange="loadQuizSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="quiz-section-sel" class="auth-input" onchange="renderQuizTable(\'' + grade + '\',\'' + branchName + '\')"><option value="">-- Bölüm Seçin --</option></select>' +
            '<div id="quiz-table-container" style="margin-top:14px;"></div>';
    } else if (tab === 'activities') {
        var units = fenData[grade]?.units || [];
        var unitOpts = '<option value="">-- Ünite Seçin --</option>';
        units.forEach(function(u) { unitOpts += '<option value="' + u.name + '">' + u.name + '</option>'; });
        content.innerHTML = '<h3 style="margin:0 0 12px;font-size:15px;">Etkinlik Ölçekleri</h3>' +
            '<select id="act-unit-sel" class="auth-input" onchange="loadActSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="act-section-sel" class="auth-input" onchange="loadActNames(\'' + grade + '\',\'' + branchName + '\')"><option value="">-- Bölüm Seçin --</option></select>' +
            '<select id="act-name-sel" class="auth-input" onchange="loadSubScales(\'' + grade + '\',\'' + branchName + '\')"><option value="">-- Etkinlik Seçin --</option></select>' +
            '<select id="sub-scale-sel" class="auth-input" onchange="renderActivityTable(\'' + grade + '\',\'' + branchName + '\')"><option value="--TUM--">-- Tüm Ölçekler --</option></select>' +
            '<div id="activity-table-container" style="margin-top:14px;"></div>';
    } else if (tab === 'reports') {
        var units = fenData[grade]?.units || [];
        var unitOpts = '<option value="">-- Ünite Seçin --</option>';
        units.forEach(function(u) { unitOpts += '<option value="' + u.name + '">' + u.name + '</option>'; });
        content.innerHTML = '<h3 style="margin:0 0 12px;font-size:15px;">Raporlar</h3>' +
            '<select id="rep-unit-sel" class="auth-input" onchange="loadRepSections(\'' + grade + '\',\'' + branchName + '\')">' + unitOpts + '</select>' +
            '<select id="rep-section-sel" class="auth-input" onchange="renderReport(\'' + grade + '\',\'' + branchName + '\')"><option value="">-- Bölüm Seçin --</option></select>' +
            '<div id="report-container" style="margin-top:14px;"></div>';
    } else {
        content.innerHTML = '<p style="color:#94a3b8;">Bu sekme henüz hazır değil.</p>';
    }
}

function fillActSections(grade) {
    var unit = document.getElementById('act-unit').value;
    var sel = document.getElementById('act-section');
    sel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    var u = (fenData[grade]?.units || []).find(function(x) { return x.name === unit; });
    if (u) u.sections.forEach(function(s) { sel.innerHTML += '<option value="' + s + '">' + s + '</option>'; });
}

function fillActActivities(grade) {
    var unit = document.getElementById('act-unit').value;
    var section = document.getElementById('act-section').value;
    var sel = document.getElementById('act-activity');
    sel.innerHTML = '<option value="">-- Etkinlik Seçin --</option>';
    var acts = (fenData[grade]?.activities || []).filter(function(a) { return a.unit === unit && a.section === section; });
    var seen = {};
    acts.forEach(function(a) {
        var base = a.name;
        if (base.indexOf(' - ') >= 0) {
            var parts = base.split(' - ');
            if (parts.length >= 2) base = parts[0] + ' - ' + parts[1];
        }
        if (!seen[base]) { seen[base] = true; sel.innerHTML += '<option value="' + base + '">' + base + '</option>'; }
    });
}

function fillActScales(grade) {
    var unit = document.getElementById('act-unit').value;
    var section = document.getElementById('act-section').value;
    var actBase = document.getElementById('act-activity').value;
    var sel = document.getElementById('act-scale');
    sel.innerHTML = '<option value="">-- Ölçek Seçin --</option><option value="ALL">-- Tüm Ölçekler --</option>';
    var acts = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && a.name.indexOf(actBase) >= 0;
    });
    var seen = {};
    acts.forEach(function(a) {
        var scaleName = a.name;
        if (scaleName.indexOf(' - ') >= 0) {
            var parts = scaleName.split(' - ');
            if (parts.length >= 3) scaleName = parts.slice(2).join(' - ');
        }
        if (scaleName && !seen[scaleName]) {
            seen[scaleName] = true;
            sel.innerHTML += '<option value="' + a.name + '">' + scaleName + '</option>';
        }
    });
}

function loadActivityTable(grade, branchName) {
    var unit = document.getElementById('act-unit').value;
    var section = document.getElementById('act-section').value;
    var scaleVal = document.getElementById('act-scale').value;
    var area = document.getElementById('act-table-area');
    if (!unit || !section || !scaleVal) { area.innerHTML = ''; return; }
    var students = fenData[grade]?.branches[branchName] || [];
    var act = (fenData[grade]?.activities || []).find(function(a) { return a.name === scaleVal; });
    var criteria = (act && act.criteria) ? act.criteria : ['Kriter 1', 'Kriter 2', 'Kriter 3', 'Kriter 4', 'Kriter 5'];
    var scaleName = scaleVal;
    if (scaleName.indexOf(' - ') >= 0) {
        var parts = scaleName.split(' - ');
        if (parts.length >= 3) scaleName = parts.slice(2).join(' - ');
    }
    var header = '<th>No</th><th>Ad Soyad</th>';
    criteria.forEach(function(c, i) {
        var short = c.length > 20 ? c.substring(0, 18) + '...' : c;
        header += '<th title="' + c + '">' + short + '</th>';
    });
    header += '<th>Toplam</th>';
    var rows = '';
    students.forEach(function(st, idx) {
        var scores = [];
        var total = 0;
        var hasData = false;
        if (st.scale && st.scale[scaleVal] && st.scale[scaleVal].scores) {
            scores = st.scale[scaleVal].scores;
            hasData = true;
        }
        rows += '<tr><td>' + st.no + '</td><td style="text-align:left;">' + st.name + '</td>';
        criteria.forEach(function(c, i) {
            var val = (scores[i] !== undefined) ? scores[i] : '';
            if (val !== '') { total += parseFloat(val) || 0; }
            rows += '<td><input type="number" min="1" max="4" value="' + val + '" style="width:40px;text-align:center;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:4px;padding:4px;" onchange="saveScaleScore(\'' + grade + '\',\'' + branchName + '\',' + idx + ',\'' + scaleVal.replace(/'/g,"\\'") + '\',' + i + ',this.value,' + criteria.length + ')"></td>';
        });
        var pct = hasData ? Math.round((total / (criteria.length * 4)) * 100) : 0;
        var badge = pct >= 85 ? 'badge-high' : (pct >= 50 ? 'badge-mid' : 'badge-low');
        rows += '<td><span class="badge ' + badge + '">%' + pct + '</span></td></tr>';
    });
    area.innerHTML = '<div style="background:rgba(30,41,59,0.7);padding:16px;border-radius:12px;margin-top:12px;" id="act-print-area">' +
        '<div style="text-align:center;margin-bottom:12px;"><b>FENOMENAL FEN BİLİMLERİ</b><br><span style="font-size:13px;color:#94a3b8;">Tekil Ölçek</span></div>' +
        '<p style="font-size:13px;"><b>Ölçek:</b> ' + scaleName + '</p>' +
        '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + header + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
            '<button onclick="alert(\'Kaydedildi\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#3b82f6;">Kaydet</button>' +
            '<button onclick="downloadActTable()" class="auth-btn" style="width:auto;padding:8px 16px;background:#dc2626;">PDF</button>' +
        '</div></div>';
}

function saveScaleScore(grade, branchName, idx, scaleName, critIdx, value, totalCrit) {
    var students = fenData[grade]?.branches[branchName];
    if (!students || !students[idx]) return;
    if (!students[idx].scale) students[idx].scale = {};
    if (!students[idx].scale[scaleName]) students[idx].scale[scaleName] = { scores: [], totalScore: 0 };
    if (!students[idx].scale[scaleName].scores) students[idx].scale[scaleName].scores = [];
    students[idx].scale[scaleName].scores[critIdx] = parseInt(value) || 0;
    var sum = 0;
    students[idx].scale[scaleName].scores.forEach(function(s) { sum += s || 0; });
    var pct = Math.round((sum / (totalCrit * 4)) * 100);
    students[idx].scale[scaleName].totalScore = pct;
    loadActivityTable(grade, branchName);
}

function downloadActTable() {
    var area = document.getElementById('act-print-area');
    if (!area) return;
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etkinlik Notları</title><style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}th{background:#f1f5f9;}</style></head><body>' + area.innerHTML + '<script>window.onload=function(){window.print();}<\/script></body></html>';
    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
}

async function saveActivityScore(grade, branchName, idx, actName, value) {
    var students = fenData[grade]?.branches[branchName] || [];
    var s = students[idx];
    if (!s) return;
    if (!s.scale) s.scale = {};
    s.scale[actName] = { totalScore: value.trim() };
    if (supabaseClient && s.id) {
        await supabaseClient.from('students').update({ scale: s.scale }).eq('id', s.id);
    }
}

function loadQuizSections(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel')?.value;
    var sel = document.getElementById('quiz-section-sel');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    if (!unit) return;
    var u = (fenData[grade]?.units || []).find(function(x) { return x.name === unit; });
    if (u && u.sections && u.sections.length > 0) {
        u.sections.forEach(function(s) {
            sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
        });
    } else {
        sel.innerHTML += '<option value="Genel">Genel</option>';
    }
    renderQuizTable(grade, branchName);
}

function renderQuizTable(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel')?.value;
    var section = document.getElementById('quiz-section-sel')?.value;
    var cont = document.getElementById('quiz-table-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Unite ve bolum secin.</p>';
        return;
    }
    var students = fenData[grade]?.branches[branchName] || [];
    var key = unit + '_' + section;
    var rows = '';
    students.forEach(function(s, idx) {
        var val = s.quiz?.[key] ?? '';
        rows += '<tr>' +
            '<td style="white-space:nowrap;">' + s.no + '</td>' +
            '<td style="white-space:nowrap; text-align:left; min-width:150px;">' + s.name + '</td>' +
            '<td><input type="text" id="quiz-' + idx + '" class="auth-input" style="width:70px; padding:6px; text-align:center; margin:0 auto;" value="' + val + '" placeholder="0-100 / G" oninput="validateScoreInput(this)"></td>' +
        '</tr>';
    });
    cont.innerHTML =
        '<div id="quiz-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>' + grade + '. Sinif (' + branchName + ') - Quiz</h3></div>' +
            '<div class="print-info">' +
                '<p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p>' +
                '<p><b>Unite:</b> ' + unit + '</p>' +
                '<p><b>Bolum:</b> ' + section + '</p>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
                '<table class="data-table">' +
                    '<thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz Notu</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="saveQuiz(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
            '<button onclick="exportTableToWord(\'quiz-print\',\'' + branchName + '_Quiz\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'quiz-print\',\'' + branchName + '_Quiz\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

async function saveQuiz(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel').value;
    var section = document.getElementById('quiz-section-sel').value;
    var key = unit + '_' + section;
    var students = fenData[grade].branches[branchName];
    for (var i = 0; i < students.length; i++) {
        var input = document.getElementById('quiz-' + i);
        if (!input) continue;
        var val = input.value.trim().toUpperCase();
        if (val !== 'G' && val !== '') {
            var n = parseFloat(val);
            if (!isNaN(n)) {
                if (n < 0) n = 0;
                if (n > 100) n = 100;
                val = n.toString();
            }
        }
        if (!students[i].quiz) students[i].quiz = {};
        students[i].quiz[key] = val;
        if (supabaseClient) {
            await supabaseClient.from('students').update({ quiz: students[i].quiz })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', students[i].no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Quiz notlari kaydedildi!');
}

function loadActSections(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var sel = document.getElementById('act-section-sel');
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    var u = fenData[grade]?.units.find(function(x) { return x.name === unit; });
    if (u) u.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    loadActNames(grade, branchName);
}

function loadActNames(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var sel = document.getElementById('act-name-sel');
    sel.innerHTML = '<option value="">-- Etkinlik Secin --</option>';
    var acts = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section;
    });
    var bases = new Set();
    acts.forEach(function(a) {
        var parts = a.name.split(' - ');
        bases.add(parts.length >= 2 ? parts[0] + ' - ' + parts[1] : a.name);
    });
    bases.forEach(function(b) {
        sel.innerHTML += '<option value="' + b + '">' + b + '</option>';
    });
    loadSubScales(grade, branchName);
}

function loadSubScales(grade, branchName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var base = document.getElementById('act-name-sel').value;
    var sel = document.getElementById('sub-scale-sel');
    sel.innerHTML = '<option value="--TUM--">-- Tum Olcekler --</option>';
    if (!base) { renderActivityTable(grade, branchName); return; }
    var subs = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === base || a.name.indexOf(base + ' -') === 0);
    });
    subs.forEach(function(s) {
        var short = s.name.replace(base, '').replace(/^[\s-]+/, '') || s.name;
        sel.innerHTML += '<option value="' + s.name + '">' + short + '</option>';
    });
    renderActivityTable(grade, branchName);
}

function renderActivityTable(grade, branchName) {
    var unit = document.getElementById('act-unit-sel')?.value;
    var section = document.getElementById('act-section-sel')?.value;
    var base = document.getElementById('act-name-sel')?.value;
    var selected = document.getElementById('sub-scale-sel')?.value;
    var cont = document.getElementById('activity-table-container');
    if (!cont) return;
    if (!base) {
        cont.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Etkinlik secin.</p>';
        return;
    }
    var allActs = fenData[grade]?.activities || [];
    var subScales = allActs.filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === base || a.name.indexOf(base + ' -') === 0);
    });
    var students = fenData[grade]?.branches[branchName] || [];

    if (selected && selected !== '--TUM--') {
        var scale = subScales.find(function(a) { return a.name === selected; });
        if (!scale) return;
        var criteria = scale.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'];
        var head = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th>';
        criteria.forEach(function(c) {
            head += '<th style="min-width:65px; max-width:90px; font-size:10px; white-space:normal; word-break:break-word; line-height:1.25;">' + c + '</th>';
        });
        head += '<th style="min-width:60px;">Toplam</th>';
        var body = '';
        students.forEach(function(s, sIdx) {
            var stored = s.scale?.[selected] || {};
            var cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
            criteria.forEach(function(_, cIdx) {
                var val = stored[cIdx] !== undefined ? stored[cIdx] : '';
                cells += '<td><input type="text" id="crit-' + sIdx + '-' + cIdx + '" class="auth-input" style="width:45px; padding:5px; text-align:center; font-size:12px;" value="' + val + '" oninput="validateScoreInput(this)"></td>';
            });
            var total = stored.totalScore !== undefined ? stored.totalScore : '-';
            cells += '<td id="total-' + sIdx + '">' + getScaleBadge(total) + '</td>';
            body += '<tr>' + cells + '</tr>';
        });
        cont.innerHTML =
            '<div id="act-print" class="print-area">' +
                '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Tekil Olcek</h3></div>' +
                '<div class="print-info"><p><b>Olcek:</b> ' + scale.name + '</p></div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
            '</div>' +
            '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button onclick="saveSingleScale(\'' + grade + '\',\'' + branchName + '\',\'' + selected + '\',' + criteria.length + ')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
                '<button onclick="exportTableToWord(\'act-print\',\'' + branchName + '_Tekil\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
                '<button onclick="exportTableToPDF(\'act-print\',\'' + branchName + '_Tekil\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
            '</div>';
        return;
    }

    var head2 = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th><th style="min-width:60px;">Hizli</th>';
    subScales.forEach(function(sc) {
        var short = sc.name.replace(base, '').replace(/^[\s-]+/, '') || sc.name;
        if (short.length > 9) short = short.substring(0, 7) + '..';
        head2 += '<th style="min-width:55px; font-size:11px;">' + short + '</th>';
    });
    var body2 = '';
    students.forEach(function(s, sIdx) {
        var first = subScales[0]?.name;
        var quick = (first && s.scale?.[first]?.totalScore !== undefined) ? s.scale[first].totalScore : '';
        var cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
        cells += '<td><input type="text" id="quick-' + sIdx + '" class="auth-input" style="width:55px; padding:5px; text-align:center;" value="' + quick + '" placeholder="85" oninput="validateScoreInput(this); applyQuick(' + sIdx + ',' + subScales.length + ')"></td>';
        subScales.forEach(function(sc, i) {
            var val = s.scale?.[sc.name]?.totalScore !== undefined ? s.scale[sc.name].totalScore : '-';
            cells += '<td id="badge-' + sIdx + '-' + i + '">' + getScaleBadge(val) + '</td>';
        });
        body2 += '<tr>' + cells + '</tr>';
    });
    cont.innerHTML =
        '<div id="act-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Tum Olcekler</h3></div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head2 + '</tr></thead><tbody>' + body2 + '</tbody></table></div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="saveGroupScales(\'' + grade + '\',\'' + branchName + '\',\'' + base + '\')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
            '<button onclick="exportTableToWord(\'act-print\',\'' + branchName + '_Tum\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'act-print\',\'' + branchName + '_Tum\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

function applyQuick(sIdx, count) {
    var val = document.getElementById('quick-' + sIdx)?.value.trim().toUpperCase() || '';
    for (var i = 0; i < count; i++) {
        var el = document.getElementById('badge-' + sIdx + '-' + i);
        if (el) el.innerHTML = getScaleBadge(val);
    }
}

async function saveSingleScale(grade, branchName, scaleName, critCount) {
    var students = fenData[grade].branches[branchName];
    var scaleObj = (fenData[grade].activities || []).find(function(a) { return a.name === scaleName; });
    var type = scaleObj?.scale_type || '1-4';
    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        if (!s.scale) s.scale = {};
        if (!s.scale[scaleName]) s.scale[scaleName] = {};
        var sum = 0, has = false;
        for (var c = 0; c < critCount; c++) {
            var input = document.getElementById('crit-' + i + '-' + c);
            if (!input) continue;
            var v = input.value.trim();
            if (v === '') continue;
            has = true;
            var n = parseFloat(v) || 0;
            s.scale[scaleName][c] = n;
            sum += n;
        }
        if (has) {
            var max = type === '1-4' ? critCount * 4 : critCount;
            s.scale[scaleName].totalScore = Math.round((sum / max) * 100);
        }
        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Tekil olcek kaydedildi!');
    renderActivityTable(grade, branchName);
}

async function saveGroupScales(grade, branchName, baseName) {
    var unit = document.getElementById('act-unit-sel').value;
    var section = document.getElementById('act-section-sel').value;
    var subScales = (fenData[grade].activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === baseName || a.name.indexOf(baseName + ' -') === 0);
    });
    var students = fenData[grade].branches[branchName];
    for (var i = 0; i < students.length; i++) {
        var input = document.getElementById('quick-' + i);
        if (!input || input.value === '') continue;
        var valText = input.value.trim().toUpperCase();
        var s = students[i];
        if (!s.scale) s.scale = {};
        subScales.forEach(function(sc) {
            if (!s.scale[sc.name]) s.scale[sc.name] = {};
            var critCount = sc.criteria?.length || 4;
            if (valText === 'G') {
                for (var c = 0; c < critCount; c++) s.scale[sc.name][c] = 0;
                s.scale[sc.name].totalScore = 'G';
            } else {
                var target = parseFloat(valText);
                if (isNaN(target)) return;
                if (target < 0) target = 0;
                if (target > 100) target = 100;
                if (sc.scale_type === '1-4') {
                    var max = critCount * 4;
                    var score = Math.round((target / 100) * max);
                    var baseVal = Math.floor(score / critCount);
                    var rem = score % critCount;
                    for (var c2 = 0; c2 < critCount; c2++) {
                        var v2 = baseVal + (c2 < rem ? 1 : 0);
                        if (v2 < 1) v2 = 1; if (v2 > 4) v2 = 4;
                        s.scale[sc.name][c2] = v2;
                    }
                } else {
                    var score2 = Math.round((target / 100) * critCount);
                    for (var c3 = 0; c3 < critCount; c3++) s.scale[sc.name][c3] = c3 < score2 ? 1 : 0;
                }
                s.scale[sc.name].totalScore = Math.round(target);
            }
        });
        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }
    await loadAllDataFromSupabase();
    alert('Olcek puanlari kaydedildi!');
    renderActivityTable(grade, branchName);
}


async function updatePoint(grade, branchName, idx, type) {
    var students = fenData[grade]?.branches[branchName] || [];
    var s = students[idx];
    if (!s) return;
    if (type === 'plus') s.plus = (s.plus || 0) + 1;
    else s.minus = (s.minus || 0) + 1;

    if (supabaseClient && s.id) {
        await supabaseClient.from('students').update({
            plus: s.plus,
            minus: s.minus
        }).eq('id', s.id);
    }
    loadBranchTabContent('students', grade, branchName);
}

async function deleteStudent(grade, branchName, idx) {
    var students = fenData[grade]?.branches[branchName] || [];
    var s = students[idx];
    if (!s || !confirm(s.name + ' silinsin mi?')) return;
    if (supabaseClient && s.id) {
        await supabaseClient.from('students').delete().eq('id', s.id);
    }
    await loadAllDataFromSupabase();
    loadBranchTabContent('students', grade, branchName);
}

function addStudentModal(grade, branchName) {
    openModal('Öğrenci Ekle',
        '<input type="number" id="m-no" class="auth-input" placeholder="Okul No">' +
        '<input type="text" id="m-name" class="auth-input" placeholder="Ad Soyad">',
    async function() {
        var no = parseInt(document.getElementById('m-no').value);
        var name = document.getElementById('m-name').value.trim();
        if (!no || !name) return alert('Tüm alanları doldurun');
        if (supabaseClient) {
            await supabaseClient.from('students').insert([{
                grade: grade,
                branch: branchName,
                school_no: no,
                name: name
            }]);
        }
        await loadAllDataFromSupabase();
        closeModal();
        loadBranchTabContent('students', grade, branchName);
    });
}

// ====================== YÖNETİM İŞLEMLERİ (basit) ======================
function loadRepSections(grade, branchName) {
    var unit = document.getElementById('rep-unit-sel').value;
    var sel = document.getElementById('rep-section-sel');
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    var u = fenData[grade]?.units.find(function(x) { return x.name === unit; });
    if (u) u.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    renderReport(grade, branchName);
}

async function renderReport(grade, branchName) {
    var unit = document.getElementById('rep-unit-sel')?.value;
    var section = document.getElementById('rep-section-sel')?.value;
    var cont = document.getElementById('report-container');
    if (!cont) return;
    if (!unit || !section) {
        cont.innerHTML = '<p style="color:#94a3b8;">Unite ve bolum secin.</p>';
        return;
    }
    var reportText = 'Bu bolum icin henuz rapor sablonu eklenmemis.';
    if (supabaseClient) {
        var res = await supabaseClient.from('report_templates')
            .select('report_text').eq('grade', grade).eq('unit_name', unit).eq('section_name', section).single();
        if (res.data?.report_text) reportText = res.data.report_text;
    }
    var students = fenData[grade]?.branches[branchName] || [];
    var acts = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section;
    });
    var rows = '';
    var quizSum = 0, quizCnt = 0, scaleSum = 0, scaleCnt = 0, genList = [];
    students.forEach(function(s) {
        var qKey = unit + '_' + section;
        var rawQ = s.quiz?.[qKey];
        var qVal = '-', qNum = null;
        if (rawQ === 'G') qVal = 'G';
        else if (rawQ !== undefined && rawQ !== '') {
            qNum = parseFloat(rawQ);
            if (!isNaN(qNum)) { qVal = qNum; quizSum += qNum; quizCnt++; }
        }
        var sSum = 0, sCnt = 0;
        acts.forEach(function(a) {
            var sc = s.scale?.[a.name]?.totalScore;
            if (sc !== undefined && sc !== 'G') {
                var n = parseFloat(sc);
                if (!isNaN(n)) { sSum += n; sCnt++; }
            }
        });
        var scaleAvg = sCnt > 0 ? Math.round(sSum / sCnt) : null;
        if (scaleAvg !== null) { scaleSum += scaleAvg; scaleCnt++; }
        var gen = null;
        if (qNum !== null && scaleAvg !== null) gen = Math.round(qNum * 0.5 + scaleAvg * 0.5);
        else if (qNum !== null) gen = Math.round(qNum);
        else if (scaleAvg !== null) gen = scaleAvg;
        if (gen !== null) genList.push(gen);
        rows += '<tr>' +
            '<td style="white-space:nowrap;">' + s.no + '</td>' +
            '<td style="white-space:nowrap; text-align:left;">' + s.name + '</td>' +
            '<td>' + getScoreBadge(qVal) + '</td>' +
            '<td>' + (scaleAvg !== null ? getScaleBadge(scaleAvg) : getScoreBadge('-')) + '</td>' +
            '<td>' + (gen !== null ? getScoreBadge(gen) : getScoreBadge('-')) + '</td>' +
        '</tr>';
    });
    var qAvg = quizCnt ? Math.round(quizSum / quizCnt) : '-';
    var sAvg = scaleCnt ? '%' + Math.round(scaleSum / scaleCnt) : '-';
    var low = genList.filter(function(g) { return g < 45; }).length;
    var mid = genList.filter(function(g) { return g >= 45 && g < 70; }).length;
    var high = genList.filter(function(g) { return g >= 70; }).length;
    cont.innerHTML =
        '<div id="report-print" class="print-area">' +
            '<div class="print-header"><h2>FENOMENAL FEN BILIMLERI</h2><h3>Analiz Raporu</h3></div>' +
            '<div class="print-info">' +
                '<p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p>' +
                '<p><b>Unite:</b> ' + unit + '</p>' +
                '<p><b>Bolum:</b> ' + section + '</p>' +
                '<p><b>Mevcut:</b> ' + students.length + ' | <b>Quiz Ort:</b> ' + qAvg + ' | <b>Olcek Ort:</b> ' + sAvg + '</p>' +
            '</div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz</th><th>Olcek</th><th>Genel</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '</div>' +
        '<div id="report-page2" class="print-area" style="margin-top:16px;">' +
            '<div style="border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:14px; background:rgba(15,23,42,0.4);">' +
                '<h4 style="margin:0 0 10px; font-size:14px;">Bolum Sonu Resmi Degerlendirme Raporu</h4>' +
                '<div style="font-size:13px; line-height:1.5; white-space:pre-wrap;">' + reportText + '</div>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-around; margin-top:12px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px;">' +
                '<span class="badge badge-low">0-45: ' + low + '</span>' +
                '<span class="badge badge-mid">45-70: ' + mid + '</span>' +
                '<span class="badge badge-high">70-100: ' + high + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="exportReportToWord(\'' + branchName + '_Rapor\')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportFullReportPDF(\'' + branchName + '_Rapor\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>';
}

function exportTableToWord(elementId, filename) {
    var element = document.getElementById(elementId);
    if (!element) return alert('Icerik bulunamadi!');
    var clone = element.cloneNode(true);
    var originalInputs = element.querySelectorAll('input');
    var clonedInputs = clone.querySelectorAll('input');
    for (var i = 0; i < originalInputs.length; i++) {
        var span = document.createElement('span');
        span.innerText = originalInputs[i].value || '-';
        span.style.color = '#000';
        span.style.fontWeight = 'bold';
        if (clonedInputs[i]) clonedInputs[i].parentNode.replaceChild(span, clonedInputs[i]);
    }
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var styles = '<style>@page{size:A4;margin:1.5cm;}body{font-family:Times New Roman,serif;color:#000;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #000;padding:6px 4px;font-size:11px;text-align:center;}th{background:#f2f2f2;font-weight:bold;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{border:1px solid #666;padding:8px;margin-bottom:10px;font-size:12px;}</style>';
    var html = '<html><head><meta charset="utf-8"><title>Rapor</title>' + styles + '</head><body>' + clone.outerHTML + '</body></html>';
    saveAs(new Blob(['\ufeff' + html], { type: 'application/msword' }), filename + '.doc');
}

function exportReportToWord(filename) {
    var part1 = document.getElementById('report-print');
    var part2 = document.getElementById('report-page2');
    if (!part1) return alert('Icerik bulunamadi!');
    var reportHtml = '';
    if (part2) {
        var textDiv = part2.querySelector('div[style*="white-space"]') || part2.querySelector('div');
        var rawText = textDiv ? (textDiv.innerText || textDiv.textContent) : '';
        var lines = rawText.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        lines.forEach(function(line) {
            if (line === line.toUpperCase() && line.length > 8 && line.charAt(0) !== '-' && line.charAt(0) !== '*') {
                reportHtml += '<p style="margin:14px 0 6px 0; font-weight:bold; font-size:13pt;">' + line + '</p>';
            } else if (line.charAt(0) === '-' || line.charAt(0) === '*' || line.charAt(0) === '\u2022') {
                reportHtml += '<p style="margin:3px 0 3px 18px; font-size:11pt;">- ' + line.replace(/^[•\-\*]\s*/, '') + '</p>';
            } else {
                reportHtml += '<p style="margin:6px 0; font-size:11pt;">' + line + '</p>';
            }
        });
    }
    var styles = '<style>@page{size:A4;margin:1.8cm;}body{font-family:Times New Roman,serif;color:#000;font-size:11pt;}table{width:100%;border-collapse:collapse;margin:12px 0;}th,td{border:1px solid #000;padding:6px 5px;font-size:10.5pt;text-align:center;}th{background:#f0f0f0;}td:nth-child(2){text-align:left;}h2{text-align:center;font-size:14pt;}</style>';
    var tableClone = part1.cloneNode(true);
    tableClone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var html = '<html><head><meta charset="utf-8"><title>Rapor</title>' + styles + '</head><body>' + tableClone.innerHTML + '<br><h2>Bolum Sonu Resmi Degerlendirme Raporu</h2>' + reportHtml + '</body></html>';
    saveAs(new Blob(['\ufeff' + html], { type: 'application/msword' }), filename + '.doc');
}

async function exportTableToPDF(elementId, filename) {
    var el = document.getElementById(elementId);
    if (!el) return alert('Icerik bulunamadi');
    var jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yuklenemedi');
    var clone = el.cloneNode(true);
    el.querySelectorAll('input').forEach(function(inp, i) {
        var span = document.createElement('span');
        span.textContent = inp.value || '-';
        span.style.cssText = 'color:#000;font-weight:bold;';
        var target = clone.querySelectorAll('input')[i];
        if (target) target.parentNode.replaceChild(span, target);
    });
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var table = clone.querySelector('table');
    var cols = table ? table.querySelectorAll('th').length : 0;
    var isWide = cols > 5 || filename.indexOf('Olcek') >= 0 || filename.indexOf('Tum') >= 0 || filename.indexOf('Tekil') >= 0;
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + (isWide ? '1200px' : '850px') + ';background:#ffffff;color:#000;padding:20px;font-family:Arial,sans-serif;z-index:99999;';
    var style = document.createElement('style');
    style.textContent = '*{color:#000!important;background:#ffffff!important;}table{width:100%!important;border-collapse:collapse!important;}th,td{border:1px solid #222!important;padding:7px 5px!important;font-size:12px!important;text-align:center;font-weight:600!important;}th{background:#e8e8e8!important;}td:nth-child(2){text-align:left!important;}.badge,span{background:transparent!important;color:#000!important;font-weight:700!important;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{border:1px solid #555;padding:8px;margin-bottom:10px;font-size:11px;background:#f8f8f8!important;}';
    container.appendChild(style);
    container.appendChild(clone);
    document.body.appendChild(container);
    await new Promise(function(r) { setTimeout(r, 400); });
    try {
        var canvas = await html2canvas(container, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
        var pdf = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        var pw = pdf.internal.pageSize.getWidth();
        var ph = pdf.internal.pageSize.getHeight();
        var margin = 10;
        var imgW = pw - margin * 2;
        var imgH = (canvas.height * imgW) / canvas.width;
        if (imgH > ph - margin * 2) {
            imgH = ph - margin * 2;
            imgW = (canvas.width * imgH) / canvas.height;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH);
        pdf.save(filename + '.pdf');
    } catch (e) {
        alert('PDF hatasi: ' + e.message);
    } finally {
        document.body.removeChild(container);
    }
}

async function exportFullReportPDF(filename) {
    var p1 = document.getElementById('report-print');
    var p2 = document.getElementById('report-page2');
    if (!p1) return alert('Icerik yok');
    var jsPDF = getJsPDF();
    if (!jsPDF) return alert('jsPDF yok');
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pw = pdf.internal.pageSize.getWidth();
    var ph = pdf.internal.pageSize.getHeight();
    var margin = 12;
    var usable = ph - margin * 2;
    var c1 = document.createElement('div');
    c1.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff;padding:20px;font-family:Arial;z-index:99999;';
    c1.innerHTML = '<style>*{color:#000!important;background:#ffffff!important;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #333;padding:5px;font-size:10px;text-align:center;font-weight:600;}th{background:#e8e8e8;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:8px;}.print-info{border:1px solid #666;padding:7px;margin-bottom:8px;font-size:10px;background:#f8f8f8;}.badge{background:transparent!important;color:#000!important;font-weight:700;}</style>';
    c1.appendChild(p1.cloneNode(true));
    document.body.appendChild(c1);
    await new Promise(function(r) { setTimeout(r, 350); });
    var canvas1 = await html2canvas(c1, { scale: 2.5, backgroundColor: '#ffffff', logging: false });
    var imgW = pw - margin * 2;
    var imgH = (canvas1.height * imgW) / canvas1.width;
    if (imgH > usable) {
        var sc = usable / imgH;
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW * sc, usable);
    } else {
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
    }
    document.body.removeChild(c1);
    if (p2) {
        pdf.addPage();
        var c2 = document.createElement('div');
        c2.style.cssText = 'position:fixed;left:-9999px;width:850px;background:#ffffff;padding:20px;font-family:Arial;z-index:99999;';
        c2.innerHTML = '<style>*{color:#000!important;background:#ffffff!important;}h4{font-size:13px;margin:0 0 8px;}p,div{font-size:11px;line-height:1.45;}.badge{background:transparent!important;color:#000!important;font-weight:700;}</style>';
        c2.appendChild(p2.cloneNode(true));
        document.body.appendChild(c2);
        await new Promise(function(r) { setTimeout(r, 350); });
        var canvas2 = await html2canvas(c2, { scale: 2.5, backgroundColor: '#ffffff', logging: false });
        imgH = (canvas2.height * imgW) / canvas2.width;
        if (imgH > usable) {
            var sc2 = Math.min(0.88, usable / imgH);
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW * sc2) / 2, margin, imgW * sc2, imgH * sc2);
        } else {
            pdf.addImage(canvas2.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
        }
        document.body.removeChild(c2);
    }
    pdf.save(filename + '.pdf');
}

function globalAddUnit() {
    openModal('Ünite Ekle',
        '<select id="m-grade" class="auth-input"><option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option></select>' +
        '<input type="text" id="m-unit-name" class="auth-input" placeholder="Ünite adı">',
    async function() {
        var g = document.getElementById('m-grade').value;
        var u = document.getElementById('m-unit-name').value.trim();
        if (!u) return alert('Ünite adı girin');
        if (supabaseClient) {
            await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: u, section_name: 'Genel' }]);
        }
        await loadAllDataFromSupabase();
        closeModal();
        alert('Ünite eklendi');
    });
}

function globalAddSection() {
    openModal('Bölüm Ekle',
        '<select id="m-grade" class="auth-input" onchange="fillModalUnits(this.value)"><option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option></select>' +
        '<select id="m-unit" class="auth-input"><option value="">Ünite seçin</option></select>' +
        '<input type="text" id="m-sec-name" class="auth-input" placeholder="Bölüm adı">',
    async function() {
        var g = document.getElementById('m-grade').value;
        var u = document.getElementById('m-unit').value;
        var s = document.getElementById('m-sec-name').value.trim();
        if (!u || !s) return alert('Tüm alanları doldurun');
        if (supabaseClient) {
            await supabaseClient.from('units_sections').insert([{ grade: g, unit_name: u, section_name: s }]);
        }
        await loadAllDataFromSupabase();
        closeModal();
        alert('Bölüm eklendi');
    });
    fillModalUnits('6');
}

function fillModalUnits(grade) {
    var sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Ünite seçin</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function globalAddActivity() {
    var html = '<label style="font-size:13px;color:#cbd5e1;">Sınıf</label>' +
        '<select id="act-grade" class="auth-input"><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select>' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Ünite</label>' +
        '<input type="text" id="act-unit" class="auth-input" placeholder="1.ÜNİTE ...">' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Bölüm</label>' +
        '<input type="text" id="act-section" class="auth-input" placeholder="1. Bölüm ...">' +
        '<label style="font-size:13px;color:#cbd5e1;margin-top:8px;">Etkinlik Adı</label>' +
        '<input type="text" id="act-name" class="auth-input" placeholder="Etkinlik 1 - ...">' +
        '<button onclick="saveActivity()" class="auth-btn" style="margin-top:16px;">Kaydet</button>';
    openManagementPage('Ölçek Yükle', html);
}

async function saveActivity() {
    var grade = document.getElementById('act-grade').value;
    var unit = document.getElementById('act-unit').value.trim();
    var section = document.getElementById('act-section').value.trim();
    var name = document.getElementById('act-name').value.trim();
    if (!unit || !section || !name) return alert('Tüm alanları doldurun');
    if (supabaseClient) {
        var res = await supabaseClient.from('activities').insert([{
            grade: grade, unit_name: unit, section_name: section, activity_name: name,
            criteria: ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'], scale_type: '1-4'
        }]);
        if (res.error) return alert(res.error.message);
    }
    await loadAllDataFromSupabase();
    alert('Etkinlik eklendi');
    openManagementMenu();
}

function globalAddReportTemplate() {
    openModal('Rapor Sablonu Ekle',
        '<select id="r-grade" class="auth-input" onchange="fillRepUnits(this.value)"><option value="5">5. Sinif</option><option value="6">6. Sinif</option><option value="7" selected>7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="r-unit" class="auth-input" onchange="fillRepSections()"><option value="">Unite</option></select>' +
        '<select id="r-section" class="auth-input"><option value="">Bolum</option></select>' +
        '<textarea id="r-text" class="auth-input" style="height:120px;" placeholder="Rapor metni..."></textarea>',
    async function() {
        var g = document.getElementById('r-grade').value;
        var u = document.getElementById('r-unit').value;
        var s = document.getElementById('r-section').value;
        var t = document.getElementById('r-text').value.trim();
        if (!u || !s || !t) return alert('Tum alanlari doldurun');
        if (supabaseClient) {
            await supabaseClient.from('report_templates').insert([{ grade: g, unit_name: u, section_name: s, report_text: t }]);
        }
        closeModal();
        alert('Rapor sablonu kaydedildi');
    });
    fillRepUnits('7');
}

function fillRepUnits(grade) {
    var sel = document.getElementById('r-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function fillRepSections() {
    var g = document.getElementById('r-grade')?.value;
    var u = document.getElementById('r-unit')?.value;
    var sel = document.getElementById('r-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
}


function globalDeleteManagement() {
    openModal('Silme Yonetimi',
        '<select id="d-grade" class="auth-input" onchange="fillDelUnits(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="d-type" class="auth-input" onchange="toggleDel()"><option value="unit">Unite Sil</option><option value="section">Bolum Sil</option><option value="activity">Etkinlik Sil</option><option value="report">Rapor Sil</option></select>' +
        '<div id="d-unit-box"><select id="d-unit" class="auth-input" onchange="fillDelSections()"><option value="">Unite</option></select></div>' +
        '<div id="d-sec-box" style="display:none;"><select id="d-section" class="auth-input"><option value="">Bolum</option></select></div>' +
        '<div id="d-act-box" style="display:none;"><select id="d-act" class="auth-input"><option value="">Etkinlik</option></select></div>',
    async function() {
        var g = document.getElementById('d-grade').value;
        var type = document.getElementById('d-type').value;
        if (type === 'unit') {
            var u = document.getElementById('d-unit').value;
            if (!u || !confirm('Unite ve bagli her sey silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u);
            }
        } else if (type === 'section') {
            var u2 = document.getElementById('d-unit').value;
            var s = document.getElementById('d-section').value;
            if (!u2 || !s || !confirm('Bolum silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
            }
        } else if (type === 'activity') {
            var a = document.getElementById('d-act').value;
            if (!a || !confirm('Etkinlik silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('activities').delete().eq('grade', g).eq('activity_name', a);
                await supabaseClient.from('activities').delete().eq('grade', g).ilike('activity_name', a + ' -%');
            }
        } else if (type === 'report') {
            var u3 = document.getElementById('d-unit').value;
            var s2 = document.getElementById('d-section').value;
            if (!u3 || !s2 || !confirm('Rapor silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u3).eq('section_name', s2);
            }
        }
        await loadAllDataFromSupabase();
        closeModal();
        alert('Silindi');
    });
    fillDelUnits('6');
    toggleDel();
}

function fillDelUnits(grade) {
    var sel = document.getElementById('d-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function fillDelSections() {
    var g = document.getElementById('d-grade')?.value;
    var u = document.getElementById('d-unit')?.value;
    var sel = document.getElementById('d-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    var actSel = document.getElementById('d-act');
    if (actSel) {
        actSel.innerHTML = '<option value="">Etkinlik</option>';
        var acts = (fenData[g]?.activities || []).filter(function(a) { return a.unit === u; });
        var bases = new Set();
        acts.forEach(function(a) {
            var p = a.name.split(' - ');
            bases.add(p.length >= 2 ? p[0] + ' - ' + p[1] : a.name);
        });
        bases.forEach(function(b) {
            actSel.innerHTML += '<option value="' + b + '">' + b + '</option>';
        });
    }
}

function toggleDel() {
    var type = document.getElementById('d-type')?.value;
    document.getElementById('d-sec-box').style.display = (type === 'section' || type === 'activity' || type === 'report') ? 'block' : 'none';
    document.getElementById('d-act-box').style.display = type === 'activity' ? 'block' : 'none';
}


// ====================== BAŞLANGIÇ ======================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadAllDataFromSupabase();
        console.log('Veri yüklendi', fenData);
    } catch (e) {
        console.error('Veri yükleme hatası:', e);
    }
    var gradeSel = document.getElementById('student-grade');
    if (gradeSel) {
        gradeSel.addEventListener('change', function() {
            updateStudentBranches();
        });
    }
    ['teacher-email', 'teacher-password'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') teacherLogin();
            });
        }
    });
    restoreStateFromSession();
});

function globalDeleteManagement() {
    openModal('Silme Yonetimi',
        '<select id="d-grade" class="auth-input" onchange="fillDelUnits(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="d-type" class="auth-input" onchange="toggleDel()"><option value="unit">Unite Sil</option><option value="section">Bolum Sil</option><option value="activity">Etkinlik Sil</option><option value="report">Rapor Sil</option></select>' +
        '<div id="d-unit-box"><select id="d-unit" class="auth-input" onchange="fillDelSections()"><option value="">Unite</option></select></div>' +
        '<div id="d-sec-box" style="display:none;"><select id="d-section" class="auth-input"><option value="">Bolum</option></select></div>' +
        '<div id="d-act-box" style="display:none;"><select id="d-act" class="auth-input"><option value="">Etkinlik</option></select></div>',
    async function() {
        var g = document.getElementById('d-grade').value;
        var type = document.getElementById('d-type').value;
        if (type === 'unit') {
            var u = document.getElementById('d-unit').value;
            if (!u || !confirm('Unite ve bagli her sey silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u);
            }
        } else if (type === 'section') {
            var u2 = document.getElementById('d-unit').value;
            var s = document.getElementById('d-section').value;
            if (!u2 || !s || !confirm('Bolum silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('units_sections').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('activities').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u2).eq('section_name', s);
            }
        } else if (type === 'activity') {
            var a = document.getElementById('d-act').value;
            if (!a || !confirm('Etkinlik silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('activities').delete().eq('grade', g).eq('activity_name', a);
                await supabaseClient.from('activities').delete().eq('grade', g).ilike('activity_name', a + ' -%');
            }
        } else if (type === 'report') {
            var u3 = document.getElementById('d-unit').value;
            var s2 = document.getElementById('d-section').value;
            if (!u3 || !s2 || !confirm('Rapor silinsin mi?')) return;
            if (supabaseClient) {
                await supabaseClient.from('report_templates').delete().eq('grade', g).eq('unit_name', u3).eq('section_name', s2);
            }
        }
        await loadAllDataFromSupabase();
        closeModal();
        alert('Silindi');
    });
    fillDelUnits('6');
    toggleDel();
}

function fillDelUnits(grade) {
    var sel = document.getElementById('d-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
}

function fillDelSections() {
    var g = document.getElementById('d-grade')?.value;
    var u = document.getElementById('d-unit')?.value;
    var sel = document.getElementById('d-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
    var actSel = document.getElementById('d-act');
    if (actSel) {
        actSel.innerHTML = '<option value="">Etkinlik</option>';
        var acts = (fenData[g]?.activities || []).filter(function(a) { return a.unit === u; });
        var bases = new Set();
        acts.forEach(function(a) {
            var p = a.name.split(' - ');
            bases.add(p.length >= 2 ? p[0] + ' - ' + p[1] : a.name);
        });
        bases.forEach(function(b) {
            actSel.innerHTML += '<option value="' + b + '">' + b + '</option>';
        });
    }
}

function toggleDel() {
    var type = document.getElementById('d-type')?.value;
    document.getElementById('d-sec-box').style.display = (type === 'section' || type === 'activity' || type === 'report') ? 'block' : 'none';
    document.getElementById('d-act-box').style.display = type === 'activity' ? 'block' : 'none';
}

