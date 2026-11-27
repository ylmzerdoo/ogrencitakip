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

// Tek ekranda tüm soruların PDF kırpma kutularını tutan geçici durum
let batchCropState = null;

// Türkçe karakter normalizasyonu
function normTR(str) {
    return (str || '').toString().trim().toUpperCase()
        .replace(/İ/g, 'I').replace(/I/g, 'I')
        .replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
        .replace(/ı/g, 'I').replace(/ş/g, 'S').replace(/ğ/g, 'G')
        .replace(/ü/g, 'U').replace(/ö/g, 'O').replace(/ç/g, 'C');
}


// ====================== OKUL / ÖĞRETMEN / BRANŞ ======================
var SUBJECTS = [
    { id: 'Fen', title: 'FEN BİLİMLERİ DERSİ' },
    { id: 'Türkçe', title: 'TÜRKÇE DERSİ' },
    { id: 'Matematik', title: 'MATEMATİK DERSİ' },
    { id: 'İngilizce', title: 'İNGİLİZCE DERSİ' },
    { id: 'Sosyal Bilgiler', title: 'SOSYAL BİLGİLER DERSİ' },
    { id: 'Din Kültürü', title: 'DİN KÜLTÜRÜ DERSİ' }
];

var BADGE_TITLES = {
    'Fen': ['Fen Ustası', 'Bilim İnsanı', 'Araştırmacı', 'Meraklı'],
    'Türkçe': ['Dil Ustası', 'Yazar', 'Kitap Kurdu', 'Meraklı'],
    'Matematik': ['Matematik Ustası', 'Problem Avcısı', 'Hesapçı', 'Meraklı'],
    'İngilizce': ['İngilizce Ustası', 'Konuşmacı', 'Kelime Avcısı', 'Meraklı'],
    'Sosyal Bilgiler': ['Sosyal Ustası', 'Tarihçi', 'Gözlemci', 'Meraklı'],
    'Din Kültürü': ['Din Kültürü Ustası', 'Bilge', 'Araştırmacı', 'Meraklı']
};

var currentTeacher = null;
var studentScope = null;
var portalCatalog = { schools: [], teachers: [], branches: [] };

function subjectTitle(subject) {
    var found = SUBJECTS.find(function(s) { return s.id === subject; });
    return found ? found.title : 'DERS';
}

function activeSubject() {
    if (studentScope && studentScope.subject) return studentScope.subject;
    if (currentTeacher && currentTeacher.subject) return currentTeacher.subject;
    return 'Fen';
}

function getSubjectLine() {
    return subjectTitle(activeSubject());
}

function getBrandTitle() {
    return 'FENOMENAL';
}

function ownerId() {
    if (currentTeacher && currentTeacher.id) return currentTeacher.id;
    if (studentScope && studentScope.teacherId) return studentScope.teacherId;
    return null;
}

function ownerSchoolId() {
    if (currentTeacher && currentTeacher.school_id) return currentTeacher.school_id;
    if (studentScope && studentScope.schoolId) return studentScope.schoolId;
    return null;
}

function rowVisible(row) {
    var oid = ownerId();
    if (!oid) return false;
    if (!row || !row.teacher_id) return !!(currentTeacher && currentTeacher.is_admin);
    return row.teacher_id === oid;
}

function stampList(list) {
    var arr = Array.isArray(list) ? list : [list];
    return arr.map(function(row) {
        var copy = Object.assign({}, row);
        var id = ownerId();
        var sid = ownerSchoolId();
        if (id) copy.teacher_id = id;
        if (sid) copy.school_id = sid;
        return copy;
    });
}

function saveStudentScope() {
    if (studentScope) sessionStorage.setItem('fen_student_scope', JSON.stringify(studentScope));
    else sessionStorage.removeItem('fen_student_scope');
}

function readStudentScope() {
    try {
        var raw = sessionStorage.getItem('fen_student_scope');
        studentScope = raw ? JSON.parse(raw) : null;
    } catch (e) {
        studentScope = null;
    }
}

async function loadPortalCatalog() {
    portalCatalog = { schools: [], teachers: [], branches: [] };
    if (!supabaseClient) return;
    var schools = await supabaseClient.from('schools').select('*').order('name');
    var teachers = await supabaseClient.from('teachers').select('*');
    var branches = await supabaseClient.from('branches').select('grade, branch_name, teacher_id, school_id');
    if (schools.error || teachers.error) return;
    portalCatalog.schools = schools.data || [];
    portalCatalog.teachers = teachers.data || [];
    portalCatalog.branches = branches.data || [];
    fillStudentSchools();
}

function fillStudentSchools() {
    var sel = document.getElementById('student-school');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">-- Okul Seçin --</option>';
    portalCatalog.schools.forEach(function(s) {
        sel.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
    });
    if (current) sel.value = current;
    fillStudentSubjects();
}

function fillStudentSubjects() {
    var schoolId = document.getElementById('student-school')?.value || '';
    var sel = document.getElementById('student-subject');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Branş Seçin --</option>';
    var seen = {};
    portalCatalog.teachers.forEach(function(t) {
        if (t.school_id !== schoolId || seen[t.subject]) return;
        seen[t.subject] = true;
        sel.innerHTML += '<option value="' + t.subject + '">' + t.subject + '</option>';
    });
    fillStudentGrades();
}

function fillStudentGrades() {
    var schoolId = document.getElementById('student-school')?.value || '';
    var subject = document.getElementById('student-subject')?.value || '';
    var sel = document.getElementById('student-grade');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Sınıf Seçin --</option>';
    var teacherIds = portalCatalog.teachers.filter(function(t) {
        return t.school_id === schoolId && t.subject === subject;
    }).map(function(t) { return t.id; });
    var grades = {};
    portalCatalog.branches.forEach(function(b) {
        if (teacherIds.indexOf(b.teacher_id) >= 0) grades[b.grade] = true;
    });
    ['5', '6', '7', '8'].forEach(function(g) {
        if (grades[g]) sel.innerHTML += '<option value="' + g + '">' + g + '. Sınıf</option>';
    });
    fillStudentBranchList();
}

function fillStudentBranchList() {
    var schoolId = document.getElementById('student-school')?.value || '';
    var subject = document.getElementById('student-subject')?.value || '';
    var grade = document.getElementById('student-grade')?.value || '';
    var sel = document.getElementById('student-branch');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Şube Seçin --</option>';
    var teacherIds = portalCatalog.teachers.filter(function(t) {
        return t.school_id === schoolId && t.subject === subject;
    }).map(function(t) { return t.id; });
    portalCatalog.branches.forEach(function(b) {
        if (b.grade !== grade || teacherIds.indexOf(b.teacher_id) < 0) return;
        var short = (b.branch_name || '').indexOf('/') >= 0 ? b.branch_name.split('/')[1] : b.branch_name;
        var opt = document.createElement('option');
        opt.value = b.teacher_id + '||' + b.branch_name;
        opt.textContent = short + ' Şubesi';
        sel.appendChild(opt);
    });
}

function updateStudentBranches() {
    fillStudentGrades();
}

async function claimLegacy() {
    if (!currentTeacher || !currentTeacher.is_admin || !supabaseClient) return;
    var tables = ['branches', 'students', 'units_sections', 'activities', 'lesson_contents', 'report_templates'];
    for (var i = 0; i < tables.length; i++) {
        var res = await supabaseClient.from(tables[i]).update({
            teacher_id: currentTeacher.id,
            school_id: currentTeacher.school_id
        }).is('teacher_id', null);
        if (res.error) {
            if (!window._schemaWarned) {
                window._schemaWarned = true;
                alert('Veritabanı güncellemesi gerekli. schema.sql dosyasını Supabase SQL editöründe bir kez çalıştır.');
            }
            return;
        }
    }
}

function applyTeacherRecord(row) {
    var school = row.schools || {};
    currentTeacher = {
        id: row.id,
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        school_id: row.school_id,
        school_name: school.name || '',
        academic_year: school.academic_year || '2025-2026',
        subject: row.subject,
        is_admin: !!row.is_admin
    };
    studentScope = null;
    sessionStorage.removeItem('fen_student_scope');
    if (currentTeacher.school_name) localStorage.setItem('fen_school_name', currentTeacher.school_name);
    if (currentTeacher.academic_year) localStorage.setItem('fen_academic_year', currentTeacher.academic_year);
}

async function bindTeacher(user) {
    if (!supabaseClient || !user) return false;
    var res = await supabaseClient.from('teachers').select('*').eq('user_id', user.id);
    if (res.error) {
        alert('Öğretmen tablosu okunamadı: ' + res.error.message);
        return false;
    }
    var row = (res.data || [])[0];
    if (!row && user.email) {
        var byEmail = await supabaseClient.from('teachers').select('*').ilike('email', user.email);
        if (byEmail.error) {
            alert('Öğretmen tablosu okunamadı: ' + byEmail.error.message);
            return false;
        }
        row = (byEmail.data || [])[0];
        if (row) {
            await supabaseClient.from('teachers').update({ user_id: user.id }).eq('id', row.id);
            row.user_id = user.id;
        }
    }
    if (!row) {
        var countRes = await supabaseClient.from('teachers').select('id');
        if (countRes.error) {
            alert('Öğretmen tablosu okunamadı: ' + countRes.error.message);
            return false;
        }
        if (!(countRes.data || []).length) {
            openFirstAdminSetup(user);
            return false;
        }
        alert('Bu hesap bir öğretmene bağlı değil. Yöneticiden eklenmesini iste.');
        await supabaseClient.auth.signOut();
        return false;
    }
    if (row.school_id) {
        var schoolRes = await supabaseClient.from('schools').select('*').eq('id', row.school_id);
        if (schoolRes.data && schoolRes.data[0]) row.schools = schoolRes.data[0];
    }
    if (!row.school_id || !row.subject) {
        openFinishTeacherSetup(user, row);
        return false;
    }
    applyTeacherRecord(row);
    await claimLegacy();
    await loadPortalCatalog();
    return true;
}

function openFinishTeacherSetup(user, row) {
    var yearPrefill = localStorage.getItem('fen_academic_year') || '2025-2026';
    var opts = SUBJECTS.map(function(s) {
        var selected = (row.subject || 'Fen') === s.id ? ' selected' : '';
        return '<option value="' + s.id + '"' + selected + '>' + s.id + '</option>';
    }).join('');
    openModal('Okulunu Bağla',
        '<p style="font-size:13px;color:#cbd5e1;margin-bottom:8px;">' + (row.full_name || '') + ' kaydı var. Okul ve branş seçilince panele girersin.</p>' +
        '<input id="setup-school" class="auth-input" placeholder="Okul adı">' +
        '<input id="setup-year" class="auth-input" placeholder="Eğitim yılı" value="' + yearPrefill.replace(/"/g, '') + '">' +
        '<select id="setup-subject" class="auth-input">' + opts + '</select>',
    async function() {
        var schoolName = document.getElementById('setup-school').value.trim();
        var year = document.getElementById('setup-year').value.trim() || '2025-2026';
        var subject = document.getElementById('setup-subject').value;
        if (!schoolName) return alert('Okul adı gerekli.');
        var schoolRes = await supabaseClient.from('schools').insert([{ name: schoolName, academic_year: year }]).select().single();
        if (schoolRes.error) return alert(schoolRes.error.message);
        var admins = await supabaseClient.from('teachers').select('id').eq('is_admin', true);
        var makeAdmin = !(admins.data || []).length;
        var upd = await supabaseClient.from('teachers').update({
            user_id: user.id,
            school_id: schoolRes.data.id,
            subject: subject,
            is_admin: makeAdmin
        }).eq('id', row.id).select('*').single();
        if (upd.error) return alert(upd.error.message);
        upd.data.schools = { name: schoolName, academic_year: year };
        closeModal();
        applyTeacherRecord(upd.data);
        await claimLegacy();
        await loadAllDataFromSupabase();
        await loadPortalCatalog();
        renderTeacherPanelView(true);
    });
}

function openFirstAdminSetup(user) {
    var schoolPrefill = localStorage.getItem('fen_school_name') || '';
    var yearPrefill = localStorage.getItem('fen_academic_year') || '2025-2026';
    var opts = SUBJECTS.map(function(s) {
        return '<option value="' + s.id + '"' + (s.id === 'Fen' ? ' selected' : '') + '>' + s.id + '</option>';
    }).join('');
    openModal('İlk Kurulum',
        '<p style="font-size:13px;color:#cbd5e1;margin-bottom:8px;">Bu hesap yönetici olacak. Mevcut Fen verisi sana bağlanır.</p>' +
        '<input id="setup-name" class="auth-input" placeholder="Ad Soyad" value="Erdoğan Yılmaz">' +
        '<input id="setup-school" class="auth-input" placeholder="Okul adı" value="' + schoolPrefill.replace(/"/g, '') + '">' +
        '<input id="setup-year" class="auth-input" placeholder="Eğitim yılı" value="' + yearPrefill.replace(/"/g, '') + '">' +
        '<select id="setup-subject" class="auth-input">' + opts + '</select>',
    async function() {
        var name = document.getElementById('setup-name').value.trim();
        var schoolName = document.getElementById('setup-school').value.trim();
        var year = document.getElementById('setup-year').value.trim() || '2025-2026';
        var subject = document.getElementById('setup-subject').value;
        if (!name || !schoolName) return alert('Ad ve okul gerekli.');
        var schoolRes = await supabaseClient.from('schools').insert([{ name: schoolName, academic_year: year }]).select().single();
        if (schoolRes.error) return alert(schoolRes.error.message);
        var teacherRes = await supabaseClient.from('teachers').insert([{
            user_id: user.id,
            full_name: name,
            email: user.email || '',
            school_id: schoolRes.data.id,
            subject: subject,
            is_admin: true
        }]).select('*').single();
        if (teacherRes.error) return alert(teacherRes.error.message);
        teacherRes.data.schools = { name: schoolName, academic_year: year };
        closeModal();
        applyTeacherRecord(teacherRes.data);
        await claimLegacy();
        await loadAllDataFromSupabase();
        await loadPortalCatalog();
        renderTeacherPanelView(true);
    });
}

function paintTeacherHome() {
    var h = document.querySelector('#teacher-panel .header-brand h1');
    if (h) h.textContent = (currentTeacher && currentTeacher.subject ? currentTeacher.subject : 'Öğretmen') + ' Paneli';
    var grid = document.querySelector('#teacher-panel .grade-cards-grid');
    var old = document.getElementById('admin-entry-card');
    if (old) old.remove();
    if (currentTeacher && currentTeacher.is_admin && grid) {
        var card = document.createElement('div');
        card.id = 'admin-entry-card';
        card.className = 'grade-card';
        card.style.borderTopColor = '#f97316';
        card.onclick = function() { openSchoolTeacherAdmin(); };
        card.innerHTML = '<h3>Okul ve Öğretmen</h3><p>Okul ekle, öğretmen kaydet</p><span class="card-action">Gir →</span>';
        grid.insertBefore(card, grid.firstChild);
    }
}

async function sameSubjectTeachers() {
    if (!currentTeacher) return [];
    if (!portalCatalog.teachers.length) await loadPortalCatalog();
    return portalCatalog.teachers.filter(function(t) {
        return t.school_id === currentTeacher.school_id && t.subject === currentTeacher.subject && t.id !== currentTeacher.id;
    });
}

async function branchTaken(grade, fullName) {
    if (!supabaseClient || !currentTeacher) return false;
    var rows = await supabaseClient.from('branches').select('teacher_id, branch_name, grade').eq('grade', grade).eq('branch_name', fullName);
    var teachers = await supabaseClient.from('teachers').select('id, school_id, subject');
    return (rows.data || []).some(function(r) {
        var t = (teachers.data || []).find(function(x) { return x.id === r.teacher_id; });
        return t && t.school_id === currentTeacher.school_id && t.subject === currentTeacher.subject;
    });
}

async function openTransferBranch(grade, branchName) {
    var others = await sameSubjectTeachers();
    if (!others.length) return alert('Aynı okul ve branşta devredilecek başka öğretmen yok.');
    var opts = others.map(function(t) {
        return '<option value="' + t.id + '">' + t.full_name + ' (' + t.subject + ')</option>';
    }).join('');
    openModal('Şubeyi Devret',
        '<p style="font-size:13px;color:#cbd5e1;margin-bottom:8px;">' + branchName + ' ve içindeki öğrenciler seçilen öğretmene geçer. Eski öğretmen bu şubeyi bir daha görmez.</p>' +
        '<select id="transfer-teacher" class="auth-input">' + opts + '</select>',
    async function() {
        var newId = document.getElementById('transfer-teacher').value;
        var oldId = currentTeacher.id;
        var schoolId = currentTeacher.school_id;
        var bRes = await supabaseClient.from('branches').update({ teacher_id: newId, school_id: schoolId }).eq('teacher_id', oldId).eq('grade', grade).eq('branch_name', branchName);
        if (bRes.error) return alert(bRes.error.message);
        await supabaseClient.from('students').update({ teacher_id: newId, school_id: schoolId }).eq('teacher_id', oldId).eq('grade', grade).eq('branch', branchName);
        var left = await supabaseClient.from('branches').select('id').eq('teacher_id', oldId).eq('grade', grade);
        var stillHas = !!(left.data && left.data.length);
        var tables = ['units_sections', 'activities', 'lesson_contents', 'report_templates'];
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i];
            var q = await supabaseClient.from(table).select('*').eq('teacher_id', oldId).eq('grade', grade);
            var rows = q.data || [];
            if (!rows.length) continue;
            if (!stillHas) {
                await supabaseClient.from(table).update({ teacher_id: newId, school_id: schoolId }).eq('teacher_id', oldId).eq('grade', grade);
            } else {
                var copies = rows.map(function(r) {
                    var c = Object.assign({}, r);
                    delete c.id;
                    delete c.created_at;
                    delete c.updated_at;
                    c.teacher_id = newId;
                    c.school_id = schoolId;
                    return c;
                });
                await supabaseClient.from(table).insert(copies);
            }
        }
        closeModal();
        await loadAllDataFromSupabase();
        await loadPortalCatalog();
        alert('Şube devredildi.');
        openGradeManagement(grade, false);
    });
}

function openSchoolTeacherAdmin() {
    if (!currentTeacher || !currentTeacher.is_admin) return alert('Bu alan sadece yöneticide.');
    saveState({ type: 'admin-users' });
    var schoolOpts = portalCatalog.schools.map(function(s) {
        return '<option value="' + s.id + '">' + s.name + '</option>';
    }).join('');
    var subjectOpts = SUBJECTS.map(function(s) {
        return '<option value="' + s.id + '">' + s.id + '</option>';
    }).join('');
    var schoolList = portalCatalog.schools.map(function(s) {
        var mine = currentTeacher && s.id === currentTeacher.school_id;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">' +
            '<span>' + s.name + (s.academic_year ? ' · ' + s.academic_year : '') + '</span>' +
            (mine ? '<span style="color:#fdba74;">Senin okulun</span>' : '<button onclick="deleteSchoolRecord(\'' + s.id + '\')" class="btn-pastel-red">Sil</button>') +
        '</div>';
    }).join('') || '<p style="color:#94a3b8;">Henüz okul yok.</p>';
    var list = portalCatalog.teachers.map(function(t) {
        var school = portalCatalog.schools.find(function(s) { return s.id === t.school_id; });
        var mine = currentTeacher && t.id === currentTeacher.id;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">' +
            '<span>' + t.full_name + ' · ' + (t.subject || 'Branş yok') + ' · ' + (school ? school.name : 'Okul yok') + '</span>' +
            (mine ? '<span style="color:#fdba74;">Sen</span>' : '<button onclick="deleteTeacherRecord(\'' + t.id + '\')" class="btn-pastel-red">Sil</button>') +
        '</div>';
    }).join('') || '<p style="color:#94a3b8;">Henüz öğretmen yok.</p>';
    var html = '<h3 style="margin:0 0 10px;font-size:15px;">Okullar</h3>' + schoolList +
        '<h3 style="margin:18px 0 10px;font-size:15px;">Öğretmenler</h3>' + list +
        '<h3 style="margin:18px 0 10px;font-size:15px;">Yeni okul</h3>' +
        '<input id="new-school-name" class="auth-input" placeholder="Okul adı">' +
        '<input id="new-school-year" class="auth-input" placeholder="Eğitim yılı" value="2025-2026">' +
        '<button onclick="saveNewSchool()" class="auth-btn" style="margin-bottom:16px;">Okulu Kaydet</button>' +
        '<h3 style="margin:8px 0 10px;font-size:15px;">Yeni öğretmen</h3>' +
        '<input id="nt-name" class="auth-input" placeholder="Ad Soyad">' +
        '<input id="nt-email" class="auth-input" placeholder="E-posta">' +
        '<input id="nt-pass" class="auth-input" type="password" placeholder="Şifre">' +
        '<select id="nt-school" class="auth-input"><option value="">-- Okul --</option>' + schoolOpts + '</select>' +
        '<select id="nt-subject" class="auth-input">' + subjectOpts + '</select>' +
        '<button onclick="saveNewTeacher()" class="auth-btn">Öğretmeni Kaydet</button>';
    openManagementPage('Okul ve Öğretmen', html);
}

async function saveNewSchool() {
    var name = document.getElementById('new-school-name').value.trim();
    var year = document.getElementById('new-school-year').value.trim() || '2025-2026';
    if (!name) return alert('Okul adı gir.');
    var res = await supabaseClient.from('schools').insert([{ name: name, academic_year: year }]);
    if (res.error) return alert(res.error.message);
    await loadPortalCatalog();
    alert('Okul kaydedildi.');
    openSchoolTeacherAdmin();
}

async function saveNewTeacher() {
    var name = document.getElementById('nt-name').value.trim();
    var email = document.getElementById('nt-email').value.trim();
    var password = document.getElementById('nt-pass').value.trim();
    var schoolId = document.getElementById('nt-school').value;
    var subject = document.getElementById('nt-subject').value;
    if (!name || !email || !password || !schoolId || !subject) return alert('Tüm alanları doldur.');
    if (password.length < 6) return alert('Şifre en az 6 karakter olsun.');
    var created = await supabaseClient.rpc('create_teacher_login', {
        target_email: email,
        target_password: password
    });
    if (created.error) return alert(created.error.message);
    var uid = created.data;
    if (!uid) return alert('Giriş hesabı açılamadı.');
    var byUser = await supabaseClient.from('teachers').select('id').eq('user_id', uid);
    var byEmail = await supabaseClient.from('teachers').select('id').ilike('email', email);
    var found = (byUser.data && byUser.data[0]) || (byEmail.data && byEmail.data[0]);
    var payload = {
        user_id: uid,
        full_name: name,
        email: email,
        school_id: schoolId,
        subject: subject,
        is_admin: false
    };
    var ins = found
        ? await supabaseClient.from('teachers').update(payload).eq('id', found.id)
        : await supabaseClient.from('teachers').insert([payload]);
    if (ins.error) return alert(ins.error.message);
    await loadPortalCatalog();
    alert('Öğretmen kaydedildi. Kendi e-posta ve şifresiyle girer.');
    openSchoolTeacherAdmin();
}

async function deleteAuthAccount(email) {
    if (!email || !supabaseClient) return null;
    return await supabaseClient.rpc('delete_auth_user', { target_email: email });
}

async function deleteTeacherRecord(id) {
    if (!currentTeacher || !currentTeacher.is_admin) return;
    if (id === currentTeacher.id) return alert('Kendi hesabını silemezsin.');
    var row = portalCatalog.teachers.find(function(t) { return t.id === id; });
    if (!confirm('Öğretmen ve giriş hesabı silinsin mi?')) return;
    var res = await supabaseClient.from('teachers').delete().eq('id', id);
    if (res.error) return alert(res.error.message);
    if (row && row.email) {
        var authRes = await deleteAuthAccount(row.email);
        if (authRes && authRes.error) return alert('Listeden silindi. Giriş hesabı silinemedi: ' + authRes.error.message);
    }
    await loadPortalCatalog();
    openSchoolTeacherAdmin();
}

async function deleteSchoolRecord(id) {
    if (!currentTeacher || !currentTeacher.is_admin) return;
    if (id === currentTeacher.school_id) return alert('Kendi okulunu silemezsin.');
    var people = portalCatalog.teachers.filter(function(t) { return t.school_id === id; });
    if (!confirm(people.length ? 'Okul, öğretmenleri ve giriş hesapları silinsin mi?' : 'Okul silinsin mi?')) return;
    for (var i = 0; i < people.length; i++) {
        if (people[i].id === currentTeacher.id) continue;
        await supabaseClient.from('teachers').delete().eq('id', people[i].id);
        if (people[i].email) await deleteAuthAccount(people[i].email);
    }
    var res = await supabaseClient.from('schools').delete().eq('id', id);
    if (res.error) return alert(res.error.message);
    await loadPortalCatalog();
    openSchoolTeacherAdmin();
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
                if (!rowVisible(row)) return;
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
                if (!rowVisible(row)) return;
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
                if (!rowVisible(row)) return;
                if (!row.grade || !row.unit_name) return;
                if (!unitMap[row.grade]) unitMap[row.grade] = {};
                if (!unitMap[row.grade][row.unit_name]) unitMap[row.grade][row.unit_name] = [];
                if (row.section_name && row.section_name !== 'Genel' && unitMap[row.grade][row.unit_name].indexOf(row.section_name) < 0) {
                    unitMap[row.grade][row.unit_name].push(row.section_name);
                }
            });
            Object.keys(unitMap).forEach(function(g) {
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
                if (!rowVisible(row)) return;
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
                if (!rowVisible(row)) return;
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
                    sort_order: row.sort_order || 0,
                    locked: row.locked === true || (row.description || '').indexOf('|LOCKED') >= 0 || row.description === 'LOCKED'
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
        case 'admin-users':
            openSchoolTeacherAdmin();
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

async function teacherLogin() {
    var email = document.getElementById('teacher-email')?.value.trim();
    var password = document.getElementById('teacher-password')?.value.trim();
    if (!email || !password) return alert('E-posta ve şifre girin.');
    try {
        if (!supabaseClient) return alert('Bağlantı yok.');
        var res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        if (res.error) return alert('Giriş başarısız: ' + res.error.message);
        var ok = await bindTeacher(res.data.user);
        if (!ok) return;
        await loadAllDataFromSupabase();
        renderTeacherPanelView(true);
    } catch (e) { alert('Giriş hatası'); }
}

async function studentLogin() {
    var schoolId = document.getElementById('student-school')?.value;
    var subject = document.getElementById('student-subject')?.value;
    var grade = document.getElementById('student-grade')?.value;
    var branchVal = document.getElementById('student-branch')?.value;
    var no = parseInt(document.getElementById('student-number')?.value);
    var nameRaw = document.getElementById('student-name')?.value.trim();
    if (!schoolId || !subject || !grade || !branchVal || !no || !nameRaw) return alert('Tüm alanları doldurun.');
    var parts = branchVal.split('||');
    var teacherId = parts[0];
    var branch = parts.slice(1).join('||');
    var school = portalCatalog.schools.find(function(s) { return s.id === schoolId; });
    currentTeacher = null;
    studentScope = {
        teacherId: teacherId,
        schoolId: schoolId,
        subject: subject,
        schoolName: school ? school.name : '',
        academicYear: school ? (school.academic_year || '2025-2026') : '2025-2026'
    };
    saveStudentScope();
    await loadAllDataFromSupabase();
    var list = fenData[grade]?.branches?.[branch] || [];
    var name = normTR(nameRaw);
    var found = list.find(function(s) {
        return parseInt(s.no) === no && normTR(s.name) === name;
    });
    if (!found) {
        studentScope = null;
        saveStudentScope();
        return alert('Öğrenci bulunamadı.');
    }
    renderStudentPanelView(grade, branch, found, true);
}

function logout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    currentTeacher = null;
    studentScope = null;
    sessionStorage.removeItem('fen_app_state');
    sessionStorage.removeItem('fen_student_scope');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
}

function showStudentScaleDetail(grade, branch, activityName, unit, section) {
    var student = null;
    try {
        var st = JSON.parse(sessionStorage.getItem('fen_app_state') || '{}');
        student = st.student;
    } catch(e){}
    if (!student) return alert('Öğrenci bilgisi bulunamadı.');

    var scales = (fenData[grade]?.activities || []).filter(function(a) {
        return a.unit === unit && a.section === section && (a.name === activityName || a.name.indexOf(activityName + ' -') === 0);
    });

    if (scales.length === 0) return alert('Bu etkinlik için ölçek bulunamadı.');

    saveState({ type: "student-scale-detail", grade: grade, branch: branch, student: student, activityName: activityName, unit: unit, section: section });

    var panel = document.getElementById('student-panel');
    var html = '<header class="teacher-header">' +
        '<div class="header-brand"><h1>Ölçek Detayları</h1></div>' +
        '<div>' +
            '<button onclick="openStudentActivities(\'' + grade + '\',\'' + branch + '\')" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
            '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
        '</div>' +
    '</header>' +
    '<section class="dashboard-content" style="max-width:1000px;margin:0 auto;padding:20px;">' +
        '<div style="background:#1e293b;padding:16px;border-radius:12px;margin-bottom:20px;">' +
            '<h2 style="margin:0 0 8px 0;color:#fff;">' + activityName + '</h2>' +
            '<p style="color:#94a3b8;font-size:14px;margin:0;">' + unit + '</p>' +
            '<p style="color:#64748b;font-size:13px;margin:4px 0 0;">' + section + '</p>' +
        '</div>';

    scales.forEach(function(sc) {
        var stored = student.scale?.[sc.name] || {};
        var criteria = (sc.criteria || []).filter(function(c) {
            return c && String(c).indexOf('Değerlendiren') < 0 && String(c).indexOf('Akran') < 0;
        });
        var scaleType = sc.scale_type || '1-4';
        var scaleName = sc.name.split(' - ').pop();

        html += '<div style="background:#0f172a;padding:16px;border-radius:12px;margin-bottom:16px;border:1px solid #334155;">';
        html += '<h3 style="margin:0 0 8px 0;color:#fdba74;font-size:16px;">' + scaleName + '</h3>';
        html += '<p style="font-size:12px;color:#94a3b8;margin-bottom:12px;padding:8px;background:#1e293b;border-radius:6px;">';
        if (scaleType === '1-4') html += 'Kodlama: 4=Çok İyi | 3=İyi | 2=Geliştirilmeli | 1=Yetersiz';
        else if (scaleType === 'evet-hayir') html += 'Kodlama: 3=Evet | 2=Kısmen | 1=Hayır';
        else html += 'Kodlama: 1=Var | 0=Yok';
        html += '</p>';
        html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="border-bottom:1px solid #334155;">';
        criteria.forEach(function(c) {
            html += '<th style="padding:8px 4px;text-align:center;font-size:10px;font-weight:500;color:#94a3b8;white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.25;vertical-align:bottom;">' + criterionHeader(c) + '</th>';
        });
        html += '<th style="padding:10px 6px;text-align:center;font-size:11px;font-weight:500;color:#94a3b8;min-width:60px;">Toplam</th></tr></thead><tbody><tr>';
        criteria.forEach(function(_, i) {
            var val = stored[i] !== undefined ? stored[i] : '-';
            html += '<td style="padding:14px 6px;text-align:center;font-size:16px;font-weight:700;color:#fff;">' + val + '</td>';
        });
        var total = stored.totalScore !== undefined ? stored.totalScore : '-';
        html += '<td style="padding:14px 6px;text-align:center;">' + getScaleBadge(total) + '</td>';
        html += '</tr></tbody></table></div></div>';
    });

    html += '</section>';
    panel.innerHTML = html;
}

function logoutStudent() {
    studentScope = null;
    sessionStorage.removeItem('fen_app_state');
    sessionStorage.removeItem('fen_student_scope');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView(false);
    loadPortalCatalog();
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
    paintTeacherHome();
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
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
                '<div class="grade-card" onclick="openStudentProgressPage()" style="border-top-color:#a855f7;">' +
                    '<h3>Öğrenci İlerlemesi</h3><span class="card-action">Git →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openTeacherInfoPage()" style="border-top-color:#ec4899;">' +
                    '<h3>Öğretmen Bilgileri</h3><span class="card-action">Git →</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

function openTeacherInfoPage() {
    var schoolName = localStorage.getItem('fen_school_name') || '';
    var academicYear = localStorage.getItem('fen_academic_year') || '2025-2026';

    openModal('Öğretmen Bilgileri',
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Okul Adı</label>' +
            '<input type="text" id="school-name" class="auth-input" value="' + schoolName + '" placeholder="Örn: Atatürk Ortaokulu">' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Eğitim-Öğretim Yılı</label>' +
            '<input type="text" id="academic-year" class="auth-input" value="' + academicYear + '" placeholder="Örn: 2025-2026">' +
        '</div>' +
        '<p style="font-size:12px;color:#64748b;">Bu bilgiler PDF ve Word belgelerinde resmi başlık olarak kullanılacak.</p>',
    async function() {
        var name = document.getElementById('school-name').value.trim();
        var year = document.getElementById('academic-year').value.trim();
        if (name) localStorage.setItem('fen_school_name', name);
        if (year) localStorage.setItem('fen_academic_year', year);
        if (supabaseClient && currentTeacher && currentTeacher.school_id && name) {
            var res = await supabaseClient.from('schools').update({ name: name, academic_year: year || '2025-2026' }).eq('id', currentTeacher.school_id);
            if (res.error) return alert(res.error.message);
            currentTeacher.school_name = name;
            currentTeacher.academic_year = year || currentTeacher.academic_year;
        }
        closeModal();
        alert('Bilgiler kaydedildi!');
    });
}

function studentPrintHeader(title, student, grade, branch) {
    var sube = String(branch || '');
    var short = sube.indexOf('/') >= 0 ? sube.split('/').pop() : sube;
    return '<div style="text-align:center;margin:0 0 14px;line-height:1.35;">' +
        '<div style="font-size:15px;font-weight:700;">' + getSchoolHeader() + '</div>' +
        '<div style="font-size:14px;font-weight:700;margin-top:4px;">' + getSubjectLine() + '</div>' +
        '<div style="font-size:16px;font-weight:800;margin-top:6px;">' + title + '</div>' +
        '<div style="font-size:12px;margin-top:4px;">' + (student.name || '') + ' · No ' + (student.no || '') + ' · ' + grade + '. Sınıf / ' + short + '</div>' +
    '</div>';
}
function getSchoolHeader() {
    var schoolName = (currentTeacher && currentTeacher.school_name) || (studentScope && studentScope.schoolName) || localStorage.getItem('fen_school_name') || 'OKUL ADI';
    var academicYear = (currentTeacher && currentTeacher.academic_year) || (studentScope && studentScope.academicYear) || localStorage.getItem('fen_academic_year') || '2025-2026';
    return academicYear + ' EĞİTİM-ÖĞRETİM YILI<br><span style="font-size:14px;">' + schoolName + '</span>';
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
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
        var res = await supabaseClient.from('units_sections').insert(stampList([{ grade: grade, unit_name: name, section_name: 'Genel' }]));
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
        var res = await supabaseClient.from('units_sections').insert(stampList([{ grade: grade, unit_name: unit, section_name: section }]));
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
        branchCards += '<div class="grade-card" onclick="openBranchMenu(\'' + grade + '\',\'' + b + '\', true)" style="border-top-color:#f97316;">' +
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
                '<button onclick="renderTeacherPanelView(false)" class="logout-btn" style="background:#f97316; margin-right:6px;">Geri</button>' +
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
        if (await branchTaken(grade, full)) return alert('Bu şube bu branşta başka öğretmende.');
        if (supabaseClient) {
            var res = await supabaseClient.from('branches').insert(stampList([{ grade: grade, branch_name: full }]));
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
        await supabaseClient.from('branches').delete().eq('teacher_id', ownerId()).eq('grade', grade).eq('branch_name', bName);
        await supabaseClient.from('students').delete().eq('teacher_id', ownerId()).eq('grade', grade).eq('branch', bName);
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
                '<button onclick="openGradeManagement(\'' + grade + '\', false)" class="logout-btn" style="background:#f97316; margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content">' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openBranchDetail(\'' + grade + '\',\'' + branchName + '\',\'students\', true)" style="border-top-color:#f97316;">' +
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
                '<div class="grade-card" onclick="openTransferBranch(\'' + grade + '\',\'' + branchName + '\')" style="border-top-color:#f97316;">' +
                    '<div style="font-size:24px; margin-bottom:6px;">5</div><h3>Şubeyi Devret</h3><span class="card-action">Devret</span>' +
                '</div>' +
            '</div>' +
        '</section>';
}

// ====================== DERS İŞLEMLERİ ======================
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
                '<button onclick="openGradeManagement(\'' + grade + '\', false)" class="logout-btn" style="background:#f97316; margin-right:6px;">Geri</button>' +
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
                    '<h3>📝 Quiz Ekle (Word / PDF)</h3><span class="card-action">Ekle →</span>' +
                '</div>' +
                '<div class="grade-card" onclick="openLockManagement(\'' + grade + '\')" style="border-top-color:#ef4444;">' +
                    '<h3>🔒 Kilit Yönetimi</h3><span class="card-action">Aç/Kapat →</span>' +
                '</div>' +
            '</div>' +
            '<h3 style="margin:24px 0 12px; font-size:15px; color:#94a3b8;">Mevcut İçerikler</h3>' +
            '<div id="existing-lessons-list"></div>' +
        '</section>';

    renderExistingLessons(grade);
}

function openLockManagement(grade) {
    var units = fenData[grade]?.units || [];
    var unitOpts = '<option value="">Ünite Seç</option>';
    units.forEach(function(u) { unitOpts += '<option value="' + u.name + '">' + u.name + '</option>'; });

    openModal('Kilit Yönetimi',
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">İşlem</label>' +
            '<select id="lock-action" class="auth-input">' +
                '<option value="unlock">🔓 Kilidi Aç (Öğrenciler Görsün)</option>' +
                '<option value="lock">🔒 Kilitle (Öğrenciler Görmesin)</option>' +
            '</select>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Ünite</label>' +
            '<select id="lock-unit" class="auth-input" onchange="fillLockSections(\'' + grade + '\')">' + unitOpts + '</select>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Bölüm</label>' +
            '<select id="lock-section" class="auth-input"><option value="">Önce Ünite Seç</option></select>' +
        '</div>' +
        '<p style="font-size:12px;color:#64748b;">Seçilen bölümdeki TÜM içerikler (PPTX, Video, Deney, Quiz) aynı anda kilitlenecek/açılacak.</p>',
    async function() {
        var action = document.getElementById('lock-action').value;
        var unit = document.getElementById('lock-unit').value;
        var section = document.getElementById('lock-section').value;
        if (!unit || !section) return alert('Ünite ve bölüm seçin');

        var isLocked = action === 'lock';
        var lessons = fenData[grade]?.lessons || [];
        var count = 0;

        for (var i = 0; i < lessons.length; i++) {
            var l = lessons[i];
            if (l.unit === unit && l.section === section) {
                var newDesc = (l.description || '').replace(/\|LOCKED/g, '').replace(/^LOCKED$/, '');
                if (isLocked) newDesc = newDesc ? (newDesc + '|LOCKED') : 'LOCKED';
                l.locked = isLocked;
                l.description = newDesc;
                if (supabaseClient && l.id) {
                    var upd = await supabaseClient.from('lesson_contents').update({ description: newDesc, locked: isLocked }).eq('id', l.id);
                    if (upd.error) {
                        await supabaseClient.from('lesson_contents').update({ description: newDesc }).eq('id', l.id);
                    }
                }
                count++;
            }
        }

        closeModal();
        alert(count + ' içerik ' + (isLocked ? 'kilitlendi. Öğrenci sayfayı yenileyince göremez.' : 'açıldı.'));
        renderExistingLessons(grade);
    });
}

function fillLockSections(grade) {
    var unit = document.getElementById('lock-unit').value;
    var sel = document.getElementById('lock-section');
    sel.innerHTML = '<option value="">Bölüm Seç</option>';
    var unitObj = (fenData[grade]?.units || []).find(function(u) { return u.name === unit; });
    if (unitObj && unitObj.sections) {
        unitObj.sections.forEach(function(s) {
            sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
        });
    }
}

function renderExistingLessons(grade) {
    var container = document.getElementById('existing-lessons-list');
    if (!container) return;
    var lessons = fenData[grade]?.lessons || [];
    if (lessons.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:13px;">Henüz içerik eklenmemiş.</p>';
        return;
    }

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
            var lockBadge = l.locked ? ' <span style="font-size:11px;color:#f87171;margin-left:6px;">Kilitli</span>' : '';
            html += '<div class="content-card">' +
                '<div class="content-card-header">' +
                    '<div>' + getContentTypeBadge(l.type) + ' <span style="margin-left:8px; font-weight:500;">' + l.title + '</span>' + lockBadge + '</div>' +
                    '<button onclick="deleteLessonContent(\'' + l.id + '\',\'' + grade + '\')" class="btn-pastel-red" style="font-size:11px;">Sil</button>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    });
    container.innerHTML = html;
}

// ====================== QUIZ EKLEME + TEK SAYFADA TOPLU KIRPMA ======================
function openAddContentModal(grade, type) {
    batchCropState = null;

    var typeLabels = {
        pptx: 'PPTX Dosyası',
        pdf: 'PDF Dosyası',
        video: 'Video (URL veya dosya)',
        experiment: 'Deney URL',
        quiz: 'Quiz (Word veya PDF)'
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
        html += '<label style="font-size:13px; color:#cbd5e1;">Quiz Dosyası (Word veya PDF)</label>' +
                '<input type="file" id="m-file" class="auth-input" accept=".docx,.doc,.pdf,application/pdf">' +
                '<label style="font-size:13px; color:#cbd5e1;margin-top:8px;">Soru Sayısı (PDF Kırpma İçin)</label>' +
                '<input type="number" id="m-qcount" class="auth-input" min="1" max="100" value="15">' +
                '<button type="button" onclick="openBatchPdfCropperModal()" class="auth-btn" style="width:auto;padding:8px 14px;background:#7c3aed;margin-top:8px;">PDF\'i Aç ve Tek Sayfada Kırp</button>' +
                '<div id="m-crop-summary" style="font-size:12px;color:#94a3b8;margin-top:6px;">Henüz kırpma yapılmadı.</div>' +
                '<label style="font-size:13px; color:#cbd5e1;margin-top:8px;">Cevap Anahtarı (Word veya TXT)</label>' +
                '<input type="file" id="m-key" class="auth-input" accept=".docx,.doc,.txt">' +
                '<p style="font-size:11px;color:#64748b;margin-top:4px;">Tek kırpma penceresinde tüm soruları sırayla kırpıp onaylayabilirsiniz. Cevap anahtarı formatı: 1-C  2-B  3-A</p>';
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

                var { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('lesson-files')
                    .upload(path, file, { upsert: false });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                    return alert('Dosya yükleme hatası: ' + uploadError.message);
                }

                try {
                    var { data: signedData, error: signedError } = await supabaseClient.storage
                        .from('lesson-files')
                        .createSignedUrl(path, 60 * 60 * 24 * 365);
                    if (signedError || !signedData) {
                        var { data: urlData } = supabaseClient.storage.from('lesson-files').getPublicUrl(path);
                        payload.file_url = urlData.publicUrl;
                    } else {
                        payload.file_url = signedData.signedUrl;
                    }
                } catch (e) {
                    var { data: urlData } = supabaseClient.storage.from('lesson-files').getPublicUrl(path);
                    payload.file_url = urlData.publicUrl;
                }
                payload.file_path = path;

                if (type === 'quiz') {
                    var isPdfQuiz = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
                    var keyInput = document.getElementById('m-key');
                    var keyText = '';
                    if (keyInput && keyInput.files && keyInput.files[0]) {
                        var keyFile = keyInput.files[0];
                        if (keyFile.name.endsWith('.txt')) {
                            keyText = await keyFile.text();
                        } else if (window.mammoth) {
                            var keyBuf = await keyFile.arrayBuffer();
                            var keyRes = await mammoth.extractRawText({ arrayBuffer: keyBuf });
                            keyText = keyRes.value || '';
                        }
                    }
                    if (isPdfQuiz) {
                        var qCountInput = document.getElementById('m-qcount');
                        var manualCount = parseInt(qCountInput && qCountInput.value, 10) || 0;
                        if (batchCropState && batchCropState.boxes && batchCropState.boxes.some(Boolean)) {
                            var countToUse = manualCount > 0 ? manualCount : batchCropState.totalQuestions;
                            var manualQs = buildQuestionsFromManualCropBoxes(countToUse, batchCropState.boxes, keyText);
                            var pagesUsed = Array.from(new Set(manualQs.map(function(q) { return q.page || 1; })));
                            payload.quiz_data = manualQs;
                            payload.description = (payload.description ? payload.description + '|' : '') +
                                'PDFQUIZ|PAGES:' + pagesUsed.join(',');
                            batchCropState = null;
                        } else {
                            var pdfBuf = await file.arrayBuffer();
                            var analyzedPdf = await analyzePdfQuizPagesAndQuestions(pdfBuf, keyText);
                            payload.quiz_data = analyzedPdf.questions;
                            payload.description = (payload.description ? payload.description + '|' : '') +
                                'PDFQUIZ|PAGES:' + (analyzedPdf.questionPages.join(',') || '1');
                            if (!payload.quiz_data.length) {
                                payload.quiz_data = buildQuizFromAnswerKey(keyText || '1-A');
                            }
                        }
                    } else {
                        try {
                            var arrayBuffer = await file.arrayBuffer();
                            var result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                            payload.quiz_data = parseQuizFromText(result.value || '');
                            if (keyText) applyAnswerKey(payload.quiz_data, keyText);
                        } catch (err) {
                            console.error('Word parse hatası:', err);
                            alert('Word okunamadı, quiz boş kaydedilecek.');
                            payload.quiz_data = [];
                        }
                    }
                }
            }

            var { error } = await supabaseClient.from('lesson_contents').insert(stampList([payload]));
            if (error) {
                console.error('DB insert error:', error);
                if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
                return alert('Kayıt hatası: ' + error.message);
            }

            await loadAllDataFromSupabase();
            closeModal();
            openLessonOperations(grade, false);
            alert('İçerik eklendi.');
        } catch (err) {
            console.error('Genel hata:', err);
            if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
            alert('Hata: ' + (err.message || err));
        } finally {
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

async function openBatchPdfCropperModal() {
    var fileInput = document.getElementById('m-file');
    var qCountEl = document.getElementById('m-qcount');
    var totalQuestions = Math.max(1, Math.min(100, parseInt(qCountEl && qCountEl.value, 10) || 15));

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        return alert('Önce bir PDF dosyası seçin.');
    }
    var file = fileInput.files[0];
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        return alert('Bu toplu kırpma aracı PDF dosyaları içindir.');
    }

    var pdfjs = await ensurePdfJsLoaded();
    if (!pdfjs) return alert('PDF.js yüklenemedi.');

    var buf = await file.arrayBuffer();
    var pdfDoc = await pdfjs.getDocument({ data: buf }).promise;

    var existingBoxes = (batchCropState && batchCropState.totalQuestions === totalQuestions)
        ? batchCropState.boxes.slice(0, totalQuestions)
        : [];
    while (existingBoxes.length < totalQuestions) {
        existingBoxes.push(null);
    }

    batchCropState = {
        pdfDoc: pdfDoc,
        numPages: pdfDoc.numPages || 1,
        currentPage: 1,
        totalQuestions: totalQuestions,
        activeIndex: 0,
        boxes: existingBoxes,
        pageCanvases: {}
    };

    var overlay = document.createElement('div');
    overlay.id = 'batch-crop-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.92);z-index:100000;display:flex;flex-direction:column;padding:16px;overflow:auto;';

    overlay.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:#0f172a;padding:12px 16px;border-radius:10px;border:1px solid #334155;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<button type="button" onclick="changeBatchCropPage(-1)" class="logout-btn" style="background:#334155;">◀ Önceki Sayfa</button>' +
                '<span id="bc-page-info" style="color:#f8fafc;font-size:13px;font-weight:600;min-width:110px;text-align:center;">Sayfa 1 / ' + batchCropState.numPages + '</span>' +
                '<button type="button" onclick="changeBatchCropPage(1)" class="logout-btn" style="background:#334155;">Sonraki Sayfa ▶</button>' +
            '</div>' +
            '<div id="bc-active-badge" style="color:#fdba74;font-size:13px;font-weight:600;">Sıradaki Kırpılacak: 1. Soru</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button type="button" onclick="closeBatchPdfCropperModal(false)" class="logout-btn" style="background:#475569;">İptal</button>' +
                '<button type="button" onclick="closeBatchPdfCropperModal(true)" class="auth-btn" style="width:auto;padding:8px 16px;background:#059669;">Kırpmaları Onayla</button>' +
            '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px;align-items:start;flex:1;">' +
            '<div style="background:#1e293b;padding:12px;border-radius:10px;border:1px solid #334155;overflow:auto;max-height:78vh;text-align:center;">' +
                '<canvas id="bc-canvas" style="cursor:crosshair;max-width:100%;background:#fff;border-radius:4px;touch-action:none;"></canvas>' +
            '</div>' +
            '<div style="background:#0f172a;padding:12px;border-radius:10px;border:1px solid #334155;max-height:78vh;overflow-y:auto;">' +
                '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Sorular (Tıklayıp seç, solda çiz)</div>' +
                '<div id="bc-question-list" style="display:flex;flex-direction:column;gap:6px;"></div>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);
    await renderBatchCropPage();
    renderBatchQuestionList();
    bindBatchCropEvents();
}

async function changeBatchCropPage(delta) {
    if (!batchCropState) return;
    var next = batchCropState.currentPage + delta;
    if (next < 1 || next > batchCropState.numPages) return;
    batchCropState.currentPage = next;
    await renderBatchCropPage();
}

async function renderBatchCropPage() {
    if (!batchCropState) return;
    var pNum = batchCropState.currentPage;
    var infoEl = document.getElementById('bc-page-info');
    if (infoEl) infoEl.textContent = 'Sayfa ' + pNum + ' / ' + batchCropState.numPages;

    if (!batchCropState.pageCanvases[pNum]) {
        var page = await batchCropState.pdfDoc.getPage(pNum);
        var vp = page.getViewport({ scale: 1.4 });
        var off = document.createElement('canvas');
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;
        batchCropState.pageCanvases[pNum] = off;
    }
    redrawBatchCropCanvas(null);
}

function redrawBatchCropCanvas(dragRect) {
    if (!batchCropState) return;
    var canvas = document.getElementById('bc-canvas');
    var baseCanvas = batchCropState.pageCanvases[batchCropState.currentPage];
    if (!canvas || !baseCanvas) return;

    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);

    batchCropState.boxes.forEach(function(box, idx) {
        if (!box || box.page !== batchCropState.currentPage) return;
        var isActive = idx === batchCropState.activeIndex;
        var x = box.xRatio * canvas.width;
        var y = box.yRatio * canvas.height;
        var w = box.wRatio * canvas.width;
        var h = box.hRatio * canvas.height;

        ctx.save();
        ctx.strokeStyle = isActive ? '#ea580c' : '#059669';
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.fillStyle = isActive ? 'rgba(37, 99, 235, 0.14)' : 'rgba(5, 150, 105, 0.10)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = isActive ? '#ea580c' : '#059669';
        ctx.fillRect(x, Math.max(0, y - 20), 66, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText((idx + 1) + '. Soru', x + 6, Math.max(14, y - 6));
        ctx.restore();
    });

    if (dragRect && dragRect.w > 4 && dragRect.h > 4) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fillRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
        ctx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
        ctx.restore();
    }
}

function bindBatchCropEvents() {
    var canvas = document.getElementById('bc-canvas');
    if (!canvas || !batchCropState) return;
    var drawing = false;
    var startX = 0, startY = 0, currRect = null;

    function getCanvasPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / (rect.width || 1);
        var scaleY = canvas.height / (rect.height || 1);
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    canvas.onmousedown = function(e) {
        drawing = true;
        var p = getCanvasPos(e);
        startX = p.x;
        startY = p.y;
        currRect = { x: startX, y: startY, w: 0, h: 0 };
    };

    canvas.onmousemove = function(e) {
        if (!drawing) return;
        var p = getCanvasPos(e);
        currRect = {
            x: Math.min(startX, p.x),
            y: Math.min(startY, p.y),
            w: Math.abs(p.x - startX),
            h: Math.abs(p.y - startY)
        };
        redrawBatchCropCanvas(currRect);
    };

    window.addEventListener('mouseup', function onUp() {
        if (!drawing) return;
        drawing = false;
        if (currRect && currRect.w > 12 && currRect.h > 12 && batchCropState) {
            var idx = batchCropState.activeIndex;
            batchCropState.boxes[idx] = {
                page: batchCropState.currentPage,
                xRatio: Math.max(0, currRect.x / canvas.width),
                yRatio: Math.max(0, currRect.y / canvas.height),
                wRatio: Math.min(1, currRect.w / canvas.width),
                hRatio: Math.min(1, currRect.h / canvas.height)
            };
            var nextUnset = -1;
            for (var i = idx + 1; i < batchCropState.totalQuestions; i++) {
                if (!batchCropState.boxes[i]) { nextUnset = i; break; }
            }
            if (nextUnset < 0) {
                for (var j = 0; j < batchCropState.totalQuestions; j++) {
                    if (!batchCropState.boxes[j]) { nextUnset = j; break; }
                }
            }
            if (nextUnset >= 0) batchCropState.activeIndex = nextUnset;
            renderBatchQuestionList();
        }
        currRect = null;
        redrawBatchCropCanvas(null);
    }, { once: false });
}

function selectBatchQuestion(idx) {
    if (!batchCropState) return;
    batchCropState.activeIndex = idx;
    var chosen = batchCropState.boxes[idx];
    if (chosen && chosen.page && chosen.page !== batchCropState.currentPage) {
        batchCropState.currentPage = chosen.page;
        renderBatchCropPage();
    } else {
        redrawBatchCropCanvas(null);
    }
    renderBatchQuestionList();
}

function renderBatchQuestionList() {
    if (!batchCropState) return;
    var listEl = document.getElementById('bc-question-list');
    var badgeEl = document.getElementById('bc-active-badge');
    if (badgeEl) {
        badgeEl.textContent = 'Sıradaki Kırpılacak: ' + (batchCropState.activeIndex + 1) + '. Soru';
    }
    if (!listEl) return;

    var html = '';
    for (var i = 0; i < batchCropState.totalQuestions; i++) {
        var box = batchCropState.boxes[i];
        var isActive = i === batchCropState.activeIndex;
        var done = !!box;
        html += '<button type="button" onclick="selectBatchQuestion(' + i + ')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;border:1px solid ' +
            (isActive ? '#f97316' : (done ? '#059669' : '#334155')) + ';background:' +
            (isActive ? 'rgba(59,130,246,0.22)' : '#1e293b') + ';color:#f8fafc;font-size:12px;cursor:pointer;">' +
            '<span><b>' + (i + 1) + '. Soru</b></span>' +
            '<span style="color:' + (done ? '#34d399' : '#94a3b8') + ';">' + (done ? 'S.' + box.page + ' ✓' : 'Bekliyor') + '</span>' +
        '</button>';
    }
    listEl.innerHTML = html;
}

function closeBatchPdfCropperModal(confirmed) {
    var overlay = document.getElementById('batch-crop-overlay');
    if (confirmed && batchCropState) {
        var doneCount = batchCropState.boxes.filter(Boolean).length;
        var summaryEl = document.getElementById('m-crop-summary');
        if (summaryEl) {
            summaryEl.textContent = doneCount + ' / ' + batchCropState.totalQuestions + ' soru kırpıldı.';
        }
    } else if (!confirmed) {
        batchCropState = null;
        var sum = document.getElementById('m-crop-summary');
        if (sum) sum.textContent = 'Henüz kırpma yapılmadı.';
    }
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
}

function buildQuestionsFromManualCropBoxes(totalQuestions, cropBoxes, keyText) {
    var answerMap = {};
    if (keyText) {
        keyText.split(/\r?\n/).forEach(function(line) {
            var many = line.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/g);
            if (many) {
                many.forEach(function(part) {
                    var m = part.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/);
                    if (m) answerMap[parseInt(m[1], 10)] = m[2].toUpperCase();
                });
            }
        });
    }
    var list = [];
    for (var i = 0; i < totalQuestions; i++) {
        var num = i + 1;
        var b = cropBoxes[i] || { page: 1, xRatio: 0.03, yRatio: 0.04, wRatio: 0.94, hRatio: 0.88 };
        list.push({
            number: num,
            page: b.page || 1,
            question: num + '. Soru',
            options: ['A', 'B', 'C', 'D'].map(function(k) { return { key: k, text: '' }; }),
            correct: answerMap[num] || null,
            cropBox: {
                xRatio: b.xRatio,
                yRatio: b.yRatio,
                wRatio: b.wRatio,
                hRatio: b.hRatio
            }
        });
    }
    return list;
}

// PDF.js kütüphanesini gerekirse yükle
async function ensurePdfJsLoaded() {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        return window.pdfjsLib;
    }
    await new Promise(function(resolve) {
        if (document.getElementById('pdfjs-cdn-script')) {
            setTimeout(resolve, 600);
            return;
        }
        var s = document.createElement('script');
        s.id = 'pdfjs-cdn-script';
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function() {
            if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            resolve();
        };
        s.onerror = function() { resolve(); };
        document.head.appendChild(s);
    });
    return window.pdfjsLib || null;
}

// PDF Quiz sayfa ve soru sırasını tespit et (otomatik fallback)
async function analyzePdfQuizPagesAndQuestions(arrayBuffer, keyText) {
    var answerMap = {};
    if (keyText) {
        var kLines = keyText.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
        kLines.forEach(function(line) {
            var many = line.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/g);
            if (many && many.length) {
                many.forEach(function(part) {
                    var m = part.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/);
                    if (m) answerMap[parseInt(m[1], 10)] = m[2].toUpperCase();
                });
                return;
            }
            var m2 = line.match(/(\d+)\s*[\.\)\-\:\s]\s*([A-Ea-e])\b/);
            if (m2) answerMap[parseInt(m2[1], 10)] = m2[2].toUpperCase();
        });
    }

    var questionPages = [];
    var detectedQuestions = [];
    var pdfjs = await ensurePdfJsLoaded();

    if (pdfjs && typeof pdfjs.getDocument === 'function') {
        try {
            var pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
            var numPages = pdfDoc.numPages || 1;
            var seenQuestionNums = {};

            for (var p = 1; p <= numPages; p++) {
                var page = await pdfDoc.getPage(p);
                var textContent = await page.getTextContent();
                var items = (textContent.items || []).filter(function(it) { return it && (it.str || '').trim(); });
                var pageText = items.map(function(it) { return it.str; }).join(' ').replace(/\s+/g, ' ').trim();
                var upperPage = pageText.toUpperCase();

                var isAnswerKeyPage = upperPage.indexOf('CEVAP ANAHTARI') >= 0 && !/\bA\)\s|\bB\)\s/.test(upperPage);
                var hasOptionMarkers = /\b[A-D]\)\s|\b[A-D]\.\s/.test(pageText);
                var qNumsInPage = [];

                items.forEach(function(it) {
                    var str = (it.str || '').trim();
                    var m = str.match(/^(\d{1,2})\.$/);
                    if (!m && /^\d{1,2}\.\s+/.test(str)) {
                        m = str.match(/^(\d{1,2})\./);
                    }
                    if (!m) return;
                    var qNum = parseInt(m[1], 10);
                    if (qNum < 1 || qNum > 100 || seenQuestionNums[qNum]) return;
                    seenQuestionNums[qNum] = true;
                    qNumsInPage.push(qNum);
                });

                var isCoverOrPromo = !hasOptionMarkers && qNumsInPage.length === 0 && (
                    upperPage.indexOf('SORU BANKASI') >= 0 ||
                    upperPage.indexOf('DENEME SINAVI') >= 0 ||
                    upperPage.indexOf('DİJİTAL KİTAP') >= 0 ||
                    upperPage.indexOf('AKILLI TAHTA') >= 0 ||
                    pageText.length < 40
                );

                if (isAnswerKeyPage || isCoverOrPromo) continue;

                if (hasOptionMarkers || qNumsInPage.length > 0) {
                    questionPages.push(p);
                }

                qNumsInPage.sort(function(a, b) { return a - b; });
                qNumsInPage.forEach(function(num) {
                    detectedQuestions.push({
                        number: num,
                        page: p,
                        question: num + '. Soru',
                        options: ['A', 'B', 'C', 'D'].map(function(k) { return { key: k, text: '' }; }),
                        correct: answerMap[num] || null,
                        cropBox: { xRatio: 0.03, yRatio: 0.04, wRatio: 0.94, hRatio: 0.88 }
                    });
                });
            }
        } catch (e) {
            console.warn('PDF sayfa analizi yedeğe geçti:', e);
        }
    }

    detectedQuestions.sort(function(a, b) { return a.number - b.number; });

    if (!detectedQuestions.length && Object.keys(answerMap).length) {
        var nums = Object.keys(answerMap).map(function(n) { return parseInt(n, 10); }).sort(function(a, b) { return a - b; });
        detectedQuestions = nums.map(function(n, idx) {
            var pg = questionPages[idx] || questionPages[0] || 1;
            return {
                number: n,
                page: pg,
                question: n + '. Soru',
                options: ['A', 'B', 'C', 'D'].map(function(k) { return { key: k, text: '' }; }),
                correct: answerMap[n],
                cropBox: { xRatio: 0.03, yRatio: 0.04, wRatio: 0.94, hRatio: 0.88 }
            };
        });
    }

    if (!questionPages.length) {
        questionPages = [1];
    }

    return {
        questionPages: questionPages,
        questions: detectedQuestions
    };
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

function buildQuizFromAnswerKey(keyText) {
    var lines = (keyText || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    var map = {};
    lines.forEach(function(line) {
        var many = line.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/g);
        if (many && many.length) {
            many.forEach(function(part) {
                var m = part.match(/(\d+)\s*[\.\)\-\:]\s*([A-Ea-e])/);
                if (m) map[parseInt(m[1], 10)] = m[2].toUpperCase();
            });
            return;
        }
        var m2 = line.match(/(\d+)\s*[\.\)\-\:\s]\s*([A-Ea-e])\b/);
        if (m2) map[parseInt(m2[1], 10)] = m2[2].toUpperCase();
    });
    var nums = Object.keys(map).map(function(n) { return parseInt(n, 10); }).sort(function(a, b) { return a - b; });
    var hasE = nums.some(function(n) { return map[n] === 'E'; });
    var keys = hasE ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    return nums.map(function(n) {
        return {
            number: n,
            page: 1,
            question: 'Soru ' + n,
            options: keys.map(function(k) { return { key: k, text: '' }; }),
            correct: map[n],
            cropBox: { xRatio: 0.03, yRatio: 0.04, wRatio: 0.94, hRatio: 0.88 }
        };
    });
}

function applyAnswerKey(questions, keyText) {
    if (!questions || !keyText) return;
    var lines = keyText.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
    var map = {};
    lines.forEach(function(line) {
        var m = line.match(/(\d+)\s*[\.\)\-\:\s]\s*([A-Da-d])\b/);
        if (m) {
            map[parseInt(m[1])] = m[2].toUpperCase();
        }
    });
    questions.forEach(function(q, i) {
        if (map[i+1]) q.correct = map[i+1];
    });
}

function parseQuizFromText(text) {
    var clean = (text || '').replace(/\r/g, '\n');
    var lines = clean.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    lines = lines.filter(function(line) {
        var upper = line.toUpperCase();
        if (upper.indexOf('AD SOYAD') >= 0) return false;
        if (upper.indexOf('SINIF:') >= 0) return false;
        if (upper.indexOf('PUAN:') >= 0) return false;
        if (upper.indexOf('BÖLÜM:') >= 0 && upper.indexOf('?') < 0) return false;
        if (/^[\-\_\=]{5,}$/.test(line)) return false;
        if (/[A-D]\d+[-\s][A-D]\d+/.test(upper)) return false;
        if (/\d+[-\.][A-D]\s+\d+[-\.][A-D]/.test(upper)) return false;
        if (upper.indexOf('CEVAP ANAHTAR') >= 0) return false;
        if (upper.indexOf('ANSWER KEY') >= 0) return false;
        return true;
    });
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

    var fullText = lines.join(' ');
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
            '<div class="header-brand"><h1>' + student.name + ' · ' + activeSubject() + '</h1></div>' +
            '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:900px; margin:0 auto;">' +
            '<h3 style="margin-bottom:14px; font-size:15px; color:#94a3b8;">Ana Menü</h3>' +
            '<div class="grade-cards-grid">' +
                '<div class="grade-card" onclick="openStudentLessons(\'' + grade + '\',\'' + branch + '\')" style="border-top-color:#f97316;">' +
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
        circles += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#f97316" stroke="#fff" stroke-width="1.5"/>';
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
            '<polyline points="' + points + '" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round"/>' +
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
        '<p style="margin-top:20px;font-size:11px;color:#666;">FENOMENAL Eğitim Portalı</p>' +
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
                rows += '<tr><td><b>' + u.name + '</b><br><span style="font-size:11px;color:#666;">' + sec + '</span><br><span style="color:#f97316;">' + baseName + '</span></td><td style="text-align:center;font-weight:bold;">%' + avg + '</td></tr>';
            });
        });
    });

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etkinlik Notları</title>' +
        '<style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px;}h2{margin:0 0 8px;}table{width:100%;border-collapse:collapse;margin-top:16px;}th,td{border:1px solid #ccc;padding:8px;vertical-align:top;}th{background:#f1f5f9;text-align:left;}</style></head><body>' +
        '<h2>Etkinlik Notları</h2>' +
        '<p><b>Öğrenci:</b> ' + student.name + ' &nbsp;&nbsp; <b>No:</b> ' + student.no + ' &nbsp;&nbsp; <b>Sınıf:</b> ' + grade + '/' + (branch.split('/')[1]||branch) + '</p>' +
        '<table><thead><tr><th>Ünite / Bölüm / Etkinlik</th><th style="width:70px;text-align:center;">Ort</th></tr></thead><tbody>' + (rows || '<tr><td colspan="2">Not yok</td></tr>') + '</tbody></table>' +
        '<p style="margin-top:20px;font-size:11px;color:#666;">FENOMENAL Eğitim Portalı</p>' +
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
        'th{background:#f97316;color:#fff;}' +
        'h3{font-size:15px;margin:18px 0 6px;}' +
        '@media print{body{padding:10px;}}' +
        '</style></head><body>' +
        '<h1>' + getBrandTitle() + '</h1>' +
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
    var names = BADGE_TITLES[activeSubject()] || BADGE_TITLES['Fen'];
    if (avg === '-' || avg == null) return { icon: '⭐', title: 'Başlangıç', color: '#64748b' };
    var n = parseFloat(avg);
    if (isNaN(n)) return { icon: '⭐', title: 'Başlangıç', color: '#64748b' };
    if (n >= 90) return { icon: '🏆', title: names[0], color: '#f59e0b' };
    if (n >= 80) return { icon: '🥇', title: names[1], color: '#eab308' };
    if (n >= 70) return { icon: '🥈', title: names[2], color: '#94a3b8' };
    if (n >= 50) return { icon: '🥉', title: names[3], color: '#d97706' };
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
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
                '<div class="grade-card" style="border-top-color:#f97316;text-align:center;grid-column:1/-1;">' +
                    '<div style="font-size:36px;">⚖️</div>' +
                    '<h3 style="font-size:28px;color:#f97316;margin:8px 0;">' + total + '</h3>' +
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
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:800px;margin:0 auto;">' +
            '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
                '<button onclick="exportTableToWord(\'student-quiz-print\',\'' + student.name.replace(/'/g,"") + '_Quiz\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#ea580c;">Word</button>' +
                '<button onclick="exportTableToPDF(\'student-quiz-print\',\'' + student.name.replace(/'/g,"") + '_Quiz\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#dc2626;">PDF</button>' +
            '</div>' +
            '<div id="student-quiz-print" class="print-area">' +
            studentPrintHeader('QUİZ KARNESİ', student, grade, branch) +
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
                        '<span style="font-size:12px;color:#fdba74;">' + baseName + '</span>' +
                    '</td>' +
                    '<td>' + getScaleBadge(avg) + '</td>' +
                    '<td><button onclick="showStudentScaleDetail(\'' + grade + '\',\'' + branch + '\',\'' + baseName.replace(/'/g, "\\'") + '\',\'' + group.unit.replace(/'/g, "\\'") + '\',\'' + group.section.replace(/'/g, "\\'") + '\')" class="auth-btn" style="width:auto;padding:4px 10px;font-size:11px;background:#f97316;">Ölçek Gör</button></td>' +
                '</tr>';
                sSum += avg; sCnt++;
            });
        });
    });

    var sAvg = sCnt ? Math.round(sSum / sCnt) : '-';

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
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\', ' + JSON.stringify(student).replace(/"/g, '"') + ', false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
                '<button onclick="logoutStudent()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:800px;margin:0 auto;">' +
            '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
                '<button onclick="exportTableToWord(\'activity-print\',\'' + student.name.replace(/'/g,"") + '_Etkinlik\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#ea580c;">Word</button>' +
                '<button onclick="exportTableToPDF(\'activity-print\',\'' + student.name.replace(/'/g,"") + '_Etkinlik\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#dc2626;">PDF</button>' +
            '</div>' +
            '<div id="activity-print" class="print-area">' +
            studentPrintHeader('ETKİNLİK KARNESİ', student, grade, branch) +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
                '<div style="background:rgba(30,41,59,0.7);padding:10px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;">' +
                    '<span style="font-size:28px;">' + getFenBadge(sCnt ? sAvg : '-').icon + '</span>' +
                    '<div><p style="font-size:13px;margin:0;"><b>Ortalama:</b> ' + (sCnt ? getScaleBadge(sAvg) : '-') + '</p>' +
                    '<p style="font-size:12px;color:' + getFenBadge(sCnt ? sAvg : '-').color + ';margin:2px 0 0;">' + getFenBadge(sCnt ? sAvg : '-').title + '</p></div>' +
                '</div>' +
            '</div>' +
            chartHtml +
            '<table class="data-table">' +
                '<thead><tr><th style="text-align:left;">Ünite / Bölüm / Etkinlik</th><th>Ort</th><th style="width:80px;">Detay</th></tr></thead>' +
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
        unitCards += '<div class="grade-card" onclick="openStudentUnit(\'' + grade + '\',\'' + branch + '\',\'' + u.name.replace(/'/g, "\\'") + '\')" style="border-top-color:#f97316;">' +
            '<h3>' + u.name + '</h3>' +
            '<p>' + count + ' içerik</p>' +
            '<span class="card-action">Gir →</span>' +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Ders</h1></div>' +
            '<div>' +
                '<button onclick="renderStudentPanelView(\'' + grade + '\',\'' + branch + '\',' + JSON.stringify(student).replace(/"/g,'&quot;') + ',false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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

    var lessons = (fenData[grade]?.lessons || []).filter(function(l) { return l.unit === unitName && !l.locked; });
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
                '<button onclick="openStudentLessons(\'' + grade + '\',\'' + branch + '\')" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
        return l.unit === unitName && l.section === sectionName && !l.locked;
    });

    var progress = await getStudentSectionProgress(student.id, grade, unitName, sectionName);

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
                '<button onclick="openStudentUnit(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\')" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
    var color = typeColors[type] || '#f97316';

    var cards = '';
    lessons.forEach(function(l, idx) {
        var isDone = completedIds.indexOf(l.id) >= 0;
        var locked = false;
        if (idx > 0) {
            var prev = lessons[idx - 1];
            if (completedIds.indexOf(prev.id) < 0) locked = true;
        }
        var safeId = String(l.id).replace(/'/g, "");
        var safeUrl = String(l.experiment_url || '').replace(/'/g, "\\'");
        var safeUnit = unitName.replace(/'/g, "\\'");
        var safeSec = sectionName.replace(/'/g, "\\'");
        var onclick = locked ? '' : (l.type === 'experiment' && l.experiment_url
            ? 'onclick="window.open(\'' + safeUrl + '\',\'_blank\');markContentComplete(\'' + safeId + '\',\'' + grade + '\',\'' + branch + '\',\'' + safeUnit + '\',\'' + safeSec + '\',\'' + type + '\')"'
            : 'onclick="openContentViewer(\'' + safeId + '\',\'' + grade + '\',\'' + branch + '\',\'' + safeUnit + '\',\'' + safeSec + '\')"');
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
                '<button onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sectionName.replace(/'/g,"\\'") + '\')" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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

async function openContentViewer(contentId, grade, branch, unitName, sectionName) {
    var lesson = (fenData[grade]?.lessons || []).find(function(l) { return l.id === contentId; });
    if (!lesson) return alert('İçerik bulunamadı');

    var student = currentStudentContext.student;
    if (supabaseClient && student && student.id && lesson.type !== 'quiz') {
        var { error } = await supabaseClient.from('student_progress').upsert({
            student_id: student.id,
            grade: grade,
            branch: branch,
            school_no: student.no || '',
            content_id: contentId,
            is_completed: true,
            completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,content_id' });
        if (error) console.error('İlerleme kayıt hatası:', error);
    }

    try {
        history.pushState({ type: 'content-view', contentId: contentId, grade: grade, branch: branch, unitName: unitName, sectionName: sectionName }, '', '#content');
    } catch(e){}

    var panel = document.getElementById('student-panel');
    var body = '';

    if (lesson.type === 'pptx' && lesson.file_url) {
        var vUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(lesson.file_url);
        body = '<iframe src="' + vUrl + '" style="position:fixed;top:50px;left:0;width:100%;height:calc(100vh - 50px);border:none;background:#1e293b;z-index:40;" allowfullscreen></iframe>';
    } else if (lesson.type === 'pdf' && lesson.file_url) {
        body = '<iframe src="' + lesson.file_url + '#toolbar=1" style="position:fixed;top:50px;left:0;width:100%;height:calc(100vh - 50px);border:none;background:#1e293b;z-index:40;" allowfullscreen></iframe>';
    } else if (lesson.type === 'experiment' && lesson.experiment_url) {
        body = '<div style="text-align:center;padding:60px 20px;">' +
            '<div style="font-size:48px;margin-bottom:16px;">🔬</div>' +
            '<h2 style="color:#f8fafc;margin-bottom:8px;">' + (lesson.title || 'Deney') + '</h2>' +
            '<p style="color:#94a3b8;margin-bottom:24px;">Deney harici bir sitede açılacak</p>' +
            '<a href="' + lesson.experiment_url + '" target="_blank" class="auth-btn" style="display:inline-block;padding:16px 32px;font-size:16px;background:#059669;">Deneyi Başlat →</a>' +
            '</div>';
    } else if (lesson.type === 'video' && lesson.file_url) {
        var ytMatch = lesson.file_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            body = '<iframe src="https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0" style="position:fixed;top:50px;left:0;width:100%;height:calc(100vh - 50px);border:none;background:#000;z-index:40;" allowfullscreen></iframe>';
        } else {
            body = '<iframe src="' + lesson.file_url + '" style="position:fixed;top:50px;left:0;width:100%;height:calc(100vh - 50px);border:none;background:#000;z-index:40;" allowfullscreen></iframe>';
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
                '<button onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + safeUnit + '\',\'' + safeSec + '\')" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
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
            '<button onclick="toggleContentViewer(\'' + id + '\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#f97316;margin-bottom:8px;">' + label + '</button>' +
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

async function markContentComplete(contentId, grade, branch, unitName, sectionName, contentType) {
    var student = currentStudentContext.student;
    if (!student || !student.id) return;

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
    if (contentType && unitName && sectionName) {
        await openContentList(contentType, grade, branch, unitName, sectionName);
    }
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

async function startStudentQuiz(contentId) {
    var grade = currentStudentContext.grade;
    var student = currentStudentContext.student;
    var lesson = (fenData[grade]?.lessons || []).find(function(l) { return l.id === contentId; });
    if (!lesson || !lesson.quiz_data || lesson.quiz_data.length === 0) {
        return alert('Bu quiz için soru bulunamadı. Öğretmen dosyasını kontrol etsin.');
    }

    if (supabaseClient && student && student.id) {
        var { data: existing } = await supabaseClient.from('quiz_results')
            .select('*')
            .eq('student_id', student.id)
            .eq('content_id', contentId)
            .eq('is_finished', true)
            .maybeSingle();
        if (existing) {
            showPreviousQuizResult(existing, lesson);
            return;
        }
    }

    var isPdf = ((lesson.description || '').indexOf('PDFQUIZ') >= 0 || /\.pdf/i.test(lesson.file_url || ''));
    currentQuizState = {
        contentId: contentId,
        questions: lesson.quiz_data,
        answers: {},
        currentIndex: 0,
        startTime: Date.now(),
        pdfUrl: isPdf ? lesson.file_url : '',
        pdfDoc: null,
        pageCache: {}
    };

    renderQuizScreen();
}

async function renderCroppedQuestionImage(q, qIndex) {
    var imgEl = document.getElementById('cropped-q-img-' + qIndex);
    var statusEl = document.getElementById('cropped-q-status-' + qIndex);
    if (!imgEl || !currentQuizState || !currentQuizState.pdfUrl) return;

    try {
        var pdfjs = await ensurePdfJsLoaded();
        if (!pdfjs) {
            if (statusEl) statusEl.textContent = 'PDF görüntüleyici yüklenemedi.';
            return;
        }
        if (!currentQuizState.pdfDoc) {
            currentQuizState.pdfDoc = await pdfjs.getDocument(currentQuizState.pdfUrl).promise;
        }
        var pageNum = q.page || 1;
        var cacheKey = pageNum + '_1.8';
        var fullCanvas = currentQuizState.pageCache[cacheKey];

        if (!fullCanvas) {
            var page = await currentQuizState.pdfDoc.getPage(pageNum);
            var viewport = page.getViewport({ scale: 1.8 });
            var c = document.createElement('canvas');
            c.width = Math.floor(viewport.width);
            c.height = Math.floor(viewport.height);
            var ctx = c.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            fullCanvas = c;
            currentQuizState.pageCache[cacheKey] = fullCanvas;
        }

        var box = q.cropBox || { xRatio: 0.03, yRatio: 0.04, wRatio: 0.94, hRatio: 0.88 };
        var sx = Math.max(0, Math.floor(fullCanvas.width * box.xRatio));
        var sy = Math.max(0, Math.floor(fullCanvas.height * box.yRatio));
        var sw = Math.min(fullCanvas.width - sx, Math.floor(fullCanvas.width * box.wRatio));
        var sh = Math.min(fullCanvas.height - sy, Math.floor(fullCanvas.height * box.hRatio));

        if (sw <= 10 || sh <= 10) {
            sx = 0; sy = 0; sw = fullCanvas.width; sh = fullCanvas.height;
        }

        var cropCanvas = document.createElement('canvas');
        cropCanvas.width = sw;
        cropCanvas.height = sh;
        var cropCtx = cropCanvas.getContext('2d');
        cropCtx.fillStyle = '#ffffff';
        cropCtx.fillRect(0, 0, sw, sh);
        cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

        imgEl.src = cropCanvas.toDataURL('image/png');
        imgEl.style.display = 'block';
        if (statusEl) statusEl.style.display = 'none';
    } catch (err) {
        console.error('Soru kırpma hatası:', err);
        if (statusEl) statusEl.textContent = 'Soru görseli kırpılamadı.';
    }
}

function showPreviousQuizResult(result, lesson) {
    var panel = document.getElementById('student-panel');
    var qs = lesson.quiz_data || [];
    var answers = result.answers || {};
    var html = '';
    qs.forEach(function(q, i) {
        var userAns = answers[i] || '-';
        var isCorrect = q.correct && userAns === q.correct;
        var border = isCorrect ? '#16a34a' : '#dc2626';
        var bg = isCorrect ? 'rgba(22,101,52,0.2)' : 'rgba(153,27,27,0.2)';
        html += '<div class="quiz-question" style="border-left:4px solid ' + border + ';background:' + bg + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-weight:600;">' + (i+1) + '. ' + (q.question || '').substring(0, 60) + '</div>' +
                '<div style="font-size:13px;font-weight:700;color:' + (isCorrect ? '#86efac' : '#fca5a5') + ';">' +
                    (isCorrect ? '✓' : '✗') + ' ' + userAns +
                '</div>' +
            '</div>' +
        '</div>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Quiz Sonucun</h1></div>' +
            '<button onclick="history.back()" class="logout-btn" style="background:#f97316;">Geri</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:700px;margin:0 auto;">' +
            '<div style="background:rgba(30,41,59,0.7);padding:16px;border-radius:12px;margin-bottom:16px;text-align:center;">' +
                '<div style="font-size:32px;font-weight:700;color:#f8fafc;">%' + result.score + '</div>' +
                '<div style="font-size:14px;color:#94a3b8;margin-top:4px;">Doğru: ' + result.correct_count + ' / ' + result.total_questions + '</div>' +
                '<div style="font-size:12px;color:#64748b;margin-top:8px;">Bu quiz daha önce çözüldü</div>' +
            '</div>' +
            html +
        '</section>';
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
            var pos = raw.search(/[A-D][\.\)\-\:]/);
            if (pos > 0 && !q.question) q.question = raw.substring(0, pos).trim();
        }
    }

    var pdfMode = !!currentQuizState.pdfUrl;
    var qLabel = q.number ? (q.number + '. Soru') : ((idx + 1) + '. Soru');

    var optionsHtml = '';
    opts.forEach(function(opt) {
        var selected = currentQuizState.answers[idx] === opt.key ? ' selected' : '';
        optionsHtml += '<div class="quiz-option' + selected + '" onclick="selectQuizAnswer(' + idx + ',\'' + opt.key + '\')">' +
            '<strong>' + opt.key + '</strong>' + (opt.text ? ') ' + opt.text : '') +
        '</div>';
    });

    var isLast = idx === total - 1;
    var hasAnswer = !!currentQuizState.answers[idx];

    var croppedQuestionBox = pdfMode
        ? '<div style="background:#ffffff;padding:12px;border-radius:10px;margin-bottom:14px;text-align:center;">' +
            '<div id="cropped-q-status-' + idx + '" style="color:#475569;font-size:13px;padding:24px 10px;">' + qLabel + ' kırpılıyor...</div>' +
            '<img id="cropped-q-img-' + idx + '" alt="' + qLabel + '" style="display:none;max-width:100%;max-height:58vh;margin:0 auto;border-radius:6px;">' +
          '</div>'
        : '<div style="font-weight:600;margin-bottom:12px;">' + (idx+1) + '. ' + q.question + '</div>';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Quiz (' + (idx+1) + ' / ' + total + ')</h1></div>' +
            '<button onclick="cancelQuiz()" class="logout-btn" style="background:#475569;">İptal</button>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:760px;margin:0 auto;">' +
            '<div class="progress-bar-container" style="margin-bottom:16px;">' +
                '<div class="progress-bar-fill" style="width:' + Math.round(((idx) / total) * 100) + '%"></div>' +
            '</div>' +
            '<div class="quiz-question">' +
                croppedQuestionBox +
                '<div style="margin-top:8px;">' + optionsHtml + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:20px;justify-content:space-between;">' +
                (idx > 0 ? '<button onclick="prevQuizQuestion()" class="auth-btn" style="width:auto;padding:10px 18px;background:#475569;">← Önceki</button>' : '<div></div>') +
                (isLast
                    ? '<button onclick="submitQuiz()" class="auth-btn" style="width:auto;padding:10px 18px;background:#059669;" ' + (!hasAnswer ? 'disabled' : '') + '>Quiz\'i Bitir</button>'
                    : '<button onclick="nextQuizQuestion()" class="auth-btn" style="width:auto;padding:10px 18px;background:#f97316;" ' + (!hasAnswer ? 'disabled' : '') + '>Sonraki →</button>') +
            '</div>' +
        '</section>';

    if (pdfMode) {
        renderCroppedQuestionImage(q, idx);
    }
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
        var userAns = (currentQuizState.answers[i] || '').toString().toUpperCase().trim();
        var correctAns = (q.correct || '').toString().toUpperCase().trim();
        if (userAns && correctAns && userAns === correctAns) correct++;
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

    showQuizResults(currentQuizState, correct, total, score);
}

function showQuizResults(state, correct, total, score) {
    var panel = document.getElementById('student-panel');
    var qs = state.questions || [];
    var html = '';
    qs.forEach(function(q, i) {
        var userAns = state.answers[i] || '-';
        var isCorrect = q.correct && userAns === q.correct;
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
            '<button onclick="openStudentLessons(currentStudentContext.grade, currentStudentContext.branch)" class="logout-btn" style="background:#f97316;">Geri</button>' +
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
                '<button onclick="openBranchMenu(\'' + grade + '\',\'' + branchName + '\', false)" class="logout-btn" style="background:#f97316; margin-right:6px;">Menü</button>' +
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
                    '<button onclick="openBulkStudentModal(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:6px 10px; background:#059669; font-size:12px;">Toplu</button><button onclick="addStudentModal(\'' + grade + '\',\'' + branchName + '\')" class="auth-btn" style="width:auto; padding:6px 10px; background:#ea580c; font-size:12px;">+ Öğrenci</button>' +
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
        '<div style="text-align:center;margin-bottom:12px;"><b>' + getBrandTitle() + '</b><br><span style="font-size:13px;color:#94a3b8;">Tekil Ölçek</span></div>' +
        '<p style="font-size:13px;"><b>Ölçek:</b> ' + scaleName + '</p>' +
        '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + header + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
            '<button onclick="alert(\'Kaydedildi\')" class="auth-btn" style="width:auto;padding:8px 16px;background:#f97316;">Kaydet</button>' +
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
            '<td><input type="text" id="quiz-' + idx + '" class="auth-input" style="width:70px; padding:6px; text-align:center; margin:0 auto;" value="' + val + '" placeholder="-" oninput="validateScoreInput(this)"></td>' +
        '</tr>';
    });
    cont.innerHTML =
        '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
            '<button onclick="exportTableToWord(\'quiz-print\',\'' + fileSafe(unit + ' ' + section + ' Quiz') + '\')" class="auth-btn" style="background:#ea580c; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'quiz-print\',\'' + fileSafe(unit + ' ' + section + ' Quiz') + '\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>' +
        '<div id="quiz-print" class="print-area">' +
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine() + '</p><h3>' + grade + '. Sinif (' + branchName + ') - Quiz</h3></div>' +
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
    var typeNames = { '1-4': 'ANALİTİK RUBRİK', '1-5': 'BÜTÜNCÜL RUBRİK', '1-3': '1-3 ÖLÇEK', 'eh': 'KONTROL LİSTESİ', 'var-yok': 'KONTROL LİSTESİ', 'evet-hayir': 'ÖZ DEĞERLENDİRME' };
    subs.forEach(function(s) {
        var short = s.name.replace(base, '').replace(/^[\s-]+/, '');
        if (!short || short === s.name) {
            short = typeNames[s.scale_type] || s.scale_type || s.name;
        }
        sel.innerHTML += '<option value="' + s.name + '">' + short + '</option>';
    });
    renderActivityTable(grade, branchName);
}

function criterionHeader(text) {
    return String(text || '')
        .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
        .split(/\s+/)
        .filter(Boolean)
        .join('<br>');
}

function fileSafe(name) {
    return String(name || 'Olcek').replace(/[\\/:*?"<>|']/g, '').replace(/\s+/g, ' ').trim().substring(0, 90) || 'Olcek';
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
        var criteria = (scale.criteria || ['1. Kriter','2. Kriter','3. Kriter','4. Kriter']).filter(function(c) {
            return c && String(c).indexOf('Değerlendiren') < 0 && String(c).indexOf('Akran') < 0;
        });
        var isAkran = (scale.name || '').toLowerCase().indexOf('akran') >= 0;
        var head = '<th style="width:50px;">No</th><th style="min-width:140px; text-align:left;">Ad Soyad</th>';
        if (isAkran) head += '<th style="min-width:120px; font-size:10px;">Değerlendiren</th>';
        criteria.forEach(function(c) {
            head += '<th style="font-size:10px; white-space:normal; word-break:normal; overflow-wrap:normal; line-height:1.25; vertical-align:bottom; padding:6px 4px;">' + criterionHeader(c) + '</th>';
        });
        head += '<th style="min-width:60px;">Toplam</th>';
        var body = '';
        students.forEach(function(s, sIdx) {
            var stored = s.scale?.[selected] || {};
            var cells = '<td style="white-space:nowrap;">' + s.no + '</td><td style="white-space:nowrap; text-align:left;">' + s.name + '</td>';
            if (isAkran) {
                var classmates = students.filter(function(st) { return st.no !== s.no; });
                var akranName = '-';
                if (classmates.length > 0) {
                    var seed = parseInt(s.no) || sIdx;
                    var idx = seed % classmates.length;
                    akranName = classmates[idx].name;
                }
                cells += '<td style="font-size:11px; color:#fdba74;">' + akranName + '</td>';
            }
            criteria.forEach(function(_, cIdx) {
                var val = stored[cIdx] !== undefined ? stored[cIdx] : '';
                cells += '<td><input type="text" id="crit-' + sIdx + '-' + cIdx + '" data-no="' + s.no + '" class="auth-input" style="width:45px; padding:5px; text-align:center; font-size:12px;" value="' + val + '" oninput="validateScoreInput(this)"></td>';
            });
            var total = stored.totalScore !== undefined ? stored.totalScore : '-';
            cells += '<td id="total-' + sIdx + '">' + getScaleBadge(total) + '</td>';
            body += '<tr>' + cells + '</tr>';
        });
        cont.innerHTML =
            '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
                '<button onclick="exportTableToWord(\'act-print\',\'' + fileSafe(scale.name) + '\')" class="auth-btn" style="background:#ea580c; width:auto; padding:8px 14px;">Word</button>' +
                '<button onclick="exportTableToPDF(\'act-print\',\'' + fileSafe(scale.name) + '\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
            '</div>' +
            '<div id="act-print" class="print-area">' +
                '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine() + '</p></div>' +
                '<div class="print-info"><p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p><p><b>Unite:</b> ' + unit + '</p><p><b>Bolum:</b> ' + section + '</p><p><b>Olcek:</b> ' + scale.name + '</p></div>' +
                '<div style="background:#1e293b;padding:8px 12px;border-radius:6px;margin-bottom:10px;font-size:12px;color:#94a3b8;">' +
                    (scale.scale_type === '1-5' ? 'Kodlama: 5=Cok iyi | 4=Iyi | 3=Yeterli | 2=Gelistirmeli | 1=Yetersiz' :
                     scale.scale_type === '1-4' ? 'Kodlama: 4=Cok Iyi | 3=Iyi | 2=Gelistirilmeli | 1=Yetersiz' :
                     scale.scale_type === '1-3' ? 'Kodlama: 3 | 2 | 1' :
                     scale.scale_type === 'eh' ? 'Kodlama: 1=Evet | 0=Hayir' :
                     scale.scale_type === 'var-yok' ? 'Kodlama: 1=Var | 0=Yok' :
                     'Kodlama: 3=Evet | 2=Kismen | 1=Hayir') +
                '</div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
            '</div>' +
            '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button onclick="saveSingleScale(\'' + grade + '\',\'' + branchName + '\',\'' + selected + '\',' + criteria.length + ')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
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
        cells += '<td><input type="text" id="quick-' + sIdx + '" data-no="' + s.no + '" class="auth-input" style="width:55px; padding:5px; text-align:center;" value="' + quick + '" placeholder="-" oninput="validateScoreInput(this); applyQuick(' + sIdx + ',' + subScales.length + ')"></td>';
        subScales.forEach(function(sc, i) {
            var val = s.scale?.[sc.name]?.totalScore !== undefined ? s.scale[sc.name].totalScore : '-';
            cells += '<td id="badge-' + sIdx + '-' + i + '">' + getScaleBadge(val) + '</td>';
        });
        body2 += '<tr>' + cells + '</tr>';
    });
    cont.innerHTML =
        '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
            '<button onclick="exportTableToWord(\'act-print\',\'' + fileSafe(base) + '\')" class="auth-btn" style="background:#ea580c; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportTableToPDF(\'act-print\',\'' + fileSafe(base) + '\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>' +
        '<div id="act-print" class="print-area">' +
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine() + '</p><h3>Tum Olcekler</h3></div><div class="print-info"><p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p><p><b>Unite:</b> ' + unit + '</p><p><b>Bolum:</b> ' + section + '</p><p><b>Etkinlik:</b> ' + base + '</p></div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + head2 + '</tr></thead><tbody>' + body2 + '</tbody></table></div>' +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
            '<button onclick="saveGroupScales(\'' + grade + '\',\'' + branchName + '\',\'' + base + '\')" class="auth-btn" style="width:auto; padding:8px 14px;">Kaydet</button>' +
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
    var rows = document.querySelectorAll('#act-print tbody tr');
    for (var i = 0; i < rows.length; i++) {
        var noCell = rows[i].querySelector('td');
        var studentNo = noCell ? parseInt(noCell.innerText) : null;
        var s = students.find(function(st) { return parseInt(st.no) === studentNo; });
        if (!s) continue;
        if (!s.scale) s.scale = {};
        if (!s.scale[scaleName]) s.scale[scaleName] = {};
        var inputs = rows[i].querySelectorAll('input');
        var sum = 0, has = false;
        for (var c = 0; c < inputs.length && c < critCount; c++) {
            var v = inputs[c].value.trim();
            if (v === '') continue;
            has = true;
            var n = parseFloat(v) || 0;
            s.scale[scaleName][c] = n;
            sum += n;
        }
        if (has) {
            var per = type === '1-5' ? 5 : type === '1-4' ? 4 : (type === '1-3' || type === 'evet-hayir') ? 3 : 1;
            var max = critCount * per;
            s.scale[scaleName].totalScore = Math.round((sum / max) * 100);
        }
        if (supabaseClient && s.no) {
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
    var inputs = document.querySelectorAll('#act-print input[data-no]');
    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var studentNo = parseInt(input.getAttribute('data-no'));
        var s = students.find(function(st) { return parseInt(st.no) === studentNo; });
        if (!s || input.value === '') continue;
        var valText = input.value.trim().toUpperCase();
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
                var minVal = 1, maxVal = 4;
                var st = (sc.scale_type || '').toLowerCase();
                var nm = (sc.name || '').toLowerCase();
                if (st === 'eh' || st === 'var-yok') { minVal = 0; maxVal = 1; }
                else if (st === '1-5') { minVal = 1; maxVal = 5; }
                else if (st === '1-3' || st === 'evet-hayir') { minVal = 1; maxVal = 3; }
                else if (st === '1-4') { minVal = 1; maxVal = 4; }
                else if (nm.indexOf('bütüncül') >= 0 || nm.indexOf('butuncul') >= 0) { minVal = 1; maxVal = 5; }
                else if (nm.indexOf('rubrik') >= 0 || nm.indexOf('analitik') >= 0 || nm.indexOf('holistik') >= 0) { minVal = 1; maxVal = 4; }
                else if (nm.indexOf('formu') >= 0 || nm.indexOf('gozlem') >= 0 || nm.indexOf('gözlem') >= 0 || nm.indexOf('oz') >= 0 || nm.indexOf('öz') >= 0 || nm.indexOf('akran') >= 0) { minVal = 1; maxVal = 3; }
                else if (nm.indexOf('kontrol') >= 0 || nm.indexOf('liste') >= 0 || nm.indexOf('listesi') >= 0) { minVal = 0; maxVal = 1; }

                var maxTotal = critCount * maxVal;
                var targetTotal = Math.round((target / 100) * maxTotal);
                var baseVal = Math.floor(targetTotal / critCount);
                var remainder = targetTotal % critCount;

                for (var c2 = 0; c2 < critCount; c2++) {
                    var v = baseVal + (c2 < remainder ? 1 : 0);
                    if (v < minVal) v = minVal;
                    if (v > maxVal) v = maxVal;
                    s.scale[sc.name][c2] = v;
                }
                s.scale[sc.name].totalScore = Math.round(target);
            }
        });
        if (supabaseClient && s.no) {
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
            await supabaseClient.from('students').insert(stampList([{
                grade: grade,
                branch: branchName,
                school_no: no,
                name: name
            }]));
        }
        await loadAllDataFromSupabase();
        closeModal();
        loadBranchTabContent('students', grade, branchName);
    });
}

// ====================== YÖNETİM İŞLEMLERİ ======================
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
            .select('report_text').eq('teacher_id', ownerId()).eq('grade', grade).eq('unit_name', unit).eq('section_name', section).maybeSingle();
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
        '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
            '<button onclick="exportReportToWord(\'' + fileSafe(unit + ' ' + section + ' Rapor') + '\')" class="auth-btn" style="background:#ea580c; width:auto; padding:8px 14px;">Word</button>' +
            '<button onclick="exportFullReportPDF(\'' + fileSafe(unit + ' ' + section + ' Rapor') + '\')" class="auth-btn" style="background:#dc2626; width:auto; padding:8px 14px;">PDF</button>' +
        '</div>' +
        '<div id="report-print" class="print-area">' +
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine() + '</p><h3>Analiz Raporu</h3></div>' +
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
        '</div>';
}

function getScoreLabel(val, scaleType) {
    if (val === '' || val === '-') return '-';
    var n = parseInt(val);
    if (isNaN(n)) return val;
    if (scaleType === '1-5') {
        if (n === 5) return '5 - Cok iyi';
        if (n === 4) return '4 - Iyi';
        if (n === 3) return '3 - Yeterli';
        if (n === 2) return '2 - Gelistirmeli';
        if (n === 1) return '1 - Yetersiz';
    } else if (scaleType === '1-4') {
        if (n === 4) return '4 - Cok Iyi';
        if (n === 3) return '3 - Iyi';
        if (n === 2) return '2 - Gelistirilmeli';
        if (n === 1) return '1 - Yetersiz';
    } else if (scaleType === '1-3') {
        if (n === 3) return '3';
        if (n === 2) return '2';
        if (n === 1) return '1';
    } else if (scaleType === 'eh') {
        if (n === 1) return '1 - Evet';
        if (n === 0) return '0 - Hayir';
    } else if (scaleType === 'evet-hayir') {
        if (n === 3) return '3 - Evet';
        if (n === 2) return '2 - Kismen';
        if (n === 1) return '1 - Hayir';
    } else if (scaleType === 'var-yok') {
        if (n === 1) return '1 - Var';
        if (n === 0) return '0 - Yok';
    }
    return val;
}

function exportTableToWord(elementId, filename) {
    var element = document.getElementById(elementId);
    if (!element) return alert('Icerik bulunamadi!');
    var clone = element.cloneNode(true);
    clone.querySelectorAll('svg').forEach(function(svg) { svg.remove(); });
    clone.querySelectorAll('div').forEach(function(div) {
        if (div.innerText && div.innerText.indexOf('Grafiği') >= 0 && div.querySelector('svg') === null) {
            div.remove();
        }
    });
    var allText = element.innerText || '';
    var scaleType = '1-4';
    if (allText.indexOf('1=Evet') >= 0) scaleType = 'eh';
    else if (allText.indexOf('5=Cok iyi') >= 0 || allText.indexOf('5=Cok Iyi') >= 0) scaleType = '1-5';
    else if (allText.indexOf('Kodlama: 3 | 2 | 1') >= 0) scaleType = '1-3';
    else if (allText.indexOf('Evet') >= 0 && allText.indexOf('Kismen') >= 0) scaleType = 'evet-hayir';
    else if (allText.indexOf('Var') >= 0 && allText.indexOf('Yok') >= 0) scaleType = 'var-yok';

    var rows = element.querySelectorAll('tbody tr');
    var cloneRows = clone.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
        var inputs = rows[r].querySelectorAll('input');
        var cloneInputs = cloneRows[r] ? cloneRows[r].querySelectorAll('input') : [];
        for (var i = 0; i < inputs.length; i++) {
            var span = document.createElement('span');
            var val = inputs[i].value.trim();
            span.innerText = getScoreLabel(val, scaleType);
            span.style.color = '#000';
            span.style.fontWeight = 'bold';
            span.style.fontSize = '10px';
            if (cloneInputs[i]) cloneInputs[i].parentNode.replaceChild(span, cloneInputs[i]);
        }
    }
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var styles = '<style>@page{size:A4 landscape;margin:1.2cm;}body{font-family:Times New Roman,serif;color:#000;}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:auto;}th,td{border:1px solid #000;padding:6px 4px;font-size:11px;text-align:center;word-break:normal;overflow-wrap:normal;}th{background:#f2f2f2;font-weight:bold;white-space:normal;line-height:1.25;vertical-align:bottom;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{border:1px solid #666;padding:8px;margin-bottom:10px;font-size:12px;}</style>';
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
    var allText = el.innerText || '';
    var scaleType = '1-4';
    if (allText.indexOf('1=Evet') >= 0) scaleType = 'eh';
    else if (allText.indexOf('5=Cok iyi') >= 0 || allText.indexOf('5=Cok Iyi') >= 0) scaleType = '1-5';
    else if (allText.indexOf('Kodlama: 3 | 2 | 1') >= 0) scaleType = '1-3';
    else if (allText.indexOf('Evet') >= 0 && allText.indexOf('Kismen') >= 0) scaleType = 'evet-hayir';
    else if (allText.indexOf('Var') >= 0 && allText.indexOf('Yok') >= 0) scaleType = 'var-yok';

    var rows = el.querySelectorAll('tbody tr');
    var cloneRows = clone.querySelectorAll('tbody tr');
    for (var r = 0; r < rows.length; r++) {
        var inputs = rows[r].querySelectorAll('input');
        var cloneInputs = cloneRows[r] ? cloneRows[r].querySelectorAll('input') : [];
        for (var i = 0; i < inputs.length; i++) {
            var span = document.createElement('span');
            var val = inputs[i].value.trim();
            span.textContent = getScoreLabel(val, scaleType);
            span.style.cssText = 'color:#000;font-weight:bold;font-size:10px;';
            if (cloneInputs[i]) cloneInputs[i].parentNode.replaceChild(span, cloneInputs[i]);
        }
    }
    clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
    var table = clone.querySelector('table');
    var cols = table ? table.querySelectorAll('th').length : 0;
    var isWide = cols > 5 || filename.indexOf('Olcek') >= 0 || filename.indexOf('Tum') >= 0 || filename.indexOf('Tekil') >= 0;
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:max-content;background:#ffffff;color:#000;padding:20px;font-family:Arial,sans-serif;z-index:99999;';
    var style = document.createElement('style');
    style.textContent = '*{color:#000!important;background:#ffffff!important;}table{width:100%!important;border-collapse:collapse!important;table-layout:auto!important;}th,td{border:1px solid #222!important;padding:8px 6px!important;font-size:13px!important;text-align:center;font-weight:600!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important;}th{background:#e8e8e8!important;white-space:normal!important;line-height:1.25!important;vertical-align:bottom!important;}td:nth-child(2){text-align:left!important;white-space:nowrap!important;}.badge,span{background:transparent!important;color:#000!important;font-weight:700!important;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:10px;}.print-info{width:100%!important;border:1px solid #555;padding:8px;margin:0 auto 10px auto!important;font-size:13px;background:#f8f8f8!important;box-sizing:border-box;}';
    container.appendChild(style);
    container.appendChild(clone);
    document.body.appendChild(container);
    await new Promise(function(r) { setTimeout(r, 400); });
    var contentH = Math.max(container.scrollHeight, 400);
    var ratio = isWide ? (277 / 190) : (190 / 277);
    var target = Math.round(contentH * ratio);
    var minW = isWide ? 1200 : 860;
    var maxW = isWide ? 1700 : 1100;
    if (target < minW) target = minW;
    if (target > maxW) target = maxW;
    container.style.width = target + 'px';
    var mainTable = clone.querySelector('table');
    if (mainTable) mainTable.style.setProperty('width', '100%', 'important');
    clone.querySelectorAll('.print-info').forEach(function(info) {
        info.style.setProperty('width', '100%', 'important');
    });
    await new Promise(function(r) { setTimeout(r, 80); });
    try {
        var canvas = await html2canvas(container, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', logging: false });
        var pdf = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        var pw = pdf.internal.pageSize.getWidth();
        var ph = pdf.internal.pageSize.getHeight();
        var margin = 8;
        var maxW = pw - margin * 2;
        var maxH = ph - margin * 2;
        var imgW = maxW;
        var imgH = (canvas.height * imgW) / canvas.width;
        if (imgH > maxH) {
            imgH = maxH;
            imgW = (canvas.width * imgH) / canvas.height;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW) / 2, margin, imgW, imgH);
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
    c1.innerHTML = '<style>*{color:#000!important;background:#ffffff!important;}table{width:100%!important;border-collapse:collapse;}th,td{border:1px solid #333;padding:6px;font-size:11px;text-align:center;font-weight:600;}th{background:#e8e8e8;}td:nth-child(2){text-align:left;}.print-header{text-align:center;border-bottom:2px solid #000;margin-bottom:8px;}.print-info{border:1px solid #666;padding:7px;margin:0 auto 8px auto;font-size:11px;background:#f8f8f8;box-sizing:border-box;}.badge{background:transparent!important;color:#000!important;font-weight:700;}</style>';
    c1.appendChild(p1.cloneNode(true));
    document.body.appendChild(c1);
    await new Promise(function(r) { setTimeout(r, 350); });
    var repTable = c1.querySelector('table');
    if (repTable) {
        c1.querySelectorAll('.print-info').forEach(function(info) {
            info.style.width = repTable.offsetWidth + 'px';
            info.style.marginLeft = 'auto';
            info.style.marginRight = 'auto';
        });
    }
    var canvas1 = await html2canvas(c1, { scale: 2.5, backgroundColor: '#ffffff', logging: false });
    var imgW = pw - margin * 2;
    var imgH = (canvas1.height * imgW) / canvas1.width;
    if (imgH > usable) {
        var sc = usable / imgH;
        var drawW = imgW * sc;
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - drawW) / 2, margin, drawW, usable);
    } else {
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.95), 'JPEG', (pw - imgW) / 2, margin, imgW, imgH);
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
            await supabaseClient.from('units_sections').insert(stampList([{ grade: g, unit_name: u, section_name: 'Genel' }]));
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
            await supabaseClient.from('units_sections').insert(stampList([{ grade: g, unit_name: u, section_name: s }]));
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

async function parseScalesFromPdf(buf) {
    var pdfjs = await ensurePdfJsLoaded();
    if (!pdfjs) throw new Error('PDF okunamadı.');
    var doc = await pdfjs.getDocument({ data: buf }).promise;
    function fold(s) {
      return String(s || '').toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    }
    function intOf(item) {
      var m = String(item.t).match(/^(\d{1,2})\.?$/);
      return m ? parseInt(m[1], 10) : 0;
    }
    function junk(text, allowShort) {
      var f = fold(text);
      if (!text || text.length < (allowShort ? 3 : 8)) return true;
      if (/^[.\-_\s]+$/.test(text)) return true;
      if (f.indexOf('toplam') >= 0 || f.indexOf('formdan') >= 0 || f.indexOf('ogretmen gorus') >= 0) return true;
      if (f.indexOf('tercih edilen') >= 0 || f.indexOf('puan araligi') >= 0 || f.indexOf('genel degerlendirme') >= 0) return true;
      if (f.indexOf('adi soyad') >= 0 || f.indexOf('kanit') >= 0) return true;
      if (/^(a|b|c|d|e|f)\)/.test(f)) return true;
      if (f === 'olcutler' || f === 'olcut' || f === 'puanlama' || f === 'gozlenecek davranis') return true;
      if (f.indexOf('degerlendirme olcut') >= 0 || f.indexOf('basari duzeyi') >= 0) return true;
      if (f.indexOf('kontrol list') >= 0) return true;
      return false;
    }
    function findScoreHeader(items) {
      var groups = {};
      items.forEach(function(i) {
        var n = intOf(i);
        if (n < 1 || n > 5) return;
        var key = Math.round(i.y / 3) * 3;
        if (!groups[key]) groups[key] = [];
        groups[key].push(i);
      });
      var best = null;
      Object.keys(groups).forEach(function(k) {
        var seen = {};
        groups[k].forEach(function(i) { var n = intOf(i); if (!seen[n] || i.x < seen[n].x) seen[n] = i; });
        var nums = Object.keys(seen).map(Number).sort(function(a, b) { return a - b; });
        if (nums.length < 3) return;
        var xs = nums.map(function(n) { return seen[n].x; });
        var span = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        if (span < 30) return;
        var max = nums[nums.length - 1];
        if (!best || nums.length > best.nums.length) {
          best = { y: parseInt(k, 10), nums: nums, max: max, xCut: Math.min.apply(null, xs) };
        }
      });
      return best;
    }
    function findYesNo(items) {
      function exact(word) { return items.filter(function(i) { return i.f === word; }); }
      var evet = exact('evet'), hayir = exact('hayir'), kismen = exact('kismen');
      var vary = exact('var'), yok = exact('yok');
      function pair(a, b) {
        var hit = null;
        a.forEach(function(x) {
          b.forEach(function(y) {
            if (Math.abs(x.y - y.y) < 8) {
              var row = { y: Math.max(x.y, y.y), xCut: Math.min(x.x, y.x) };
              if (!hit || row.xCut < hit.xCut) hit = row;
            }
          });
        });
        return hit;
      }
      var eh = pair(evet, hayir);
      if (eh) return { y: eh.y, xCut: eh.xCut, mode: kismen.length ? 'evet-hayir' : 'eh' };
      var vy = pair(vary, yok);
      if (vy) return { y: vy.y, xCut: vy.xCut, mode: 'var-yok' };
      return null;
    }
    function titleOn(items, fallback) {
      var blob = items.map(function(i) { return i.t; }).join(' ');
      var f = fold(blob);
      if (f.indexOf('butuncul') >= 0) return 'Bütüncül Puanlama Anahtarı';
      if (f.indexOf('analitik dereceli') >= 0) return 'Analitik Dereceli Puanlama Anahtarı';
      if (f.indexOf('oz degerlendirme') >= 0) return 'Öz Değerlendirme Formu';
      if (f.indexOf('akran') >= 0 && f.indexOf('form') >= 0) return 'Akran Değerlendirme Formu';
      if (f.indexOf('gozlem formu') >= 0) {
        var head = items.filter(function(i) { return fold(i.t).indexOf('gozlem formu') >= 0; }).sort(function(a, b) { return b.y - a.y; })[0];
        return head ? head.t : 'Gözlem Formu';
      }
      if (f.indexOf('kontrol list') >= 0) return 'Kontrol Listesi';
      return fallback;
    }
    function numberedCriteria(items, textXMax, headerY) {
      var pool = items.filter(function(i) {
        var n = intOf(i);
        return n >= 1 && n <= 40 && i.x < textXMax - 30 && (headerY == null || i.y < headerY - 6);
      });
      var cols = {};
      pool.forEach(function(i) {
        var key = Math.round(i.x / 12) * 12;
        if (!cols[key]) cols[key] = [];
        cols[key].push(i);
      });
      var nums = [];
      Object.keys(cols).forEach(function(k) {
        var seq = cols[k].slice().sort(function(a, b) { return b.y - a.y; });
        var inc = 0;
        for (var i = 1; i < seq.length; i++) if (intOf(seq[i]) === intOf(seq[i - 1]) + 1) inc++;
        if (seq.length >= 3 && inc >= seq.length - 2 && (!nums.length || seq.length > nums.length)) nums = seq;
      });
      if (nums.length < 3) return [];
      var out = [];
      nums.forEach(function(num) {
        var bits = items.filter(function(i) {
          if (i === num || intOf(i)) return false;
          if (i.x < num.x + 8 || i.x >= textXMax - 8) return false;
          return Math.abs(i.y - num.y) <= 16;
        }).sort(function(a, b) { return b.y - a.y || a.x - b.x; });
        var text = bits.map(function(i) { return i.t; }).join(' ').replace(/\s+/g, ' ').trim();
        text = text.replace(/([A-Za-zÇĞİÖŞÜçğıöşü])\s*-\s+([a-zçğıöşü])/g, '$1$2');
        if (!junk(text)) out.push(text);
      });
      return out;
    }
    function leftNames(items, header) {
      var pool = items.filter(function(i) {
        return i.y < header.y - 8 && i.x < header.xCut - 8 && !intOf(i) && i.t.length > 1;
      });
      var groups = {};
      pool.forEach(function(i) {
        var key = Math.round(i.x / 20) * 20;
        if (!groups[key]) groups[key] = [];
        groups[key].push(i);
      });
      var chosen = null;
      Object.keys(groups).map(Number).sort(function(a, b) { return a - b; }).forEach(function(k) {
        if (chosen == null && groups[k].length >= 2) chosen = k;
      });
      if (chosen == null) return [];
      var xs = groups[chosen].map(function(i) { return i.x; }).sort(function(a, b) { return a - b; });
      var med = xs[Math.floor(xs.length / 2)];
      var rows = {};
      pool.forEach(function(i) {
        if (Math.abs(i.x - med) > 36) return;
        var key = Math.round(i.y);
        if (!rows[key]) rows[key] = [];
        rows[key].push(i);
      });
      var ys = Object.keys(rows).map(Number).sort(function(a, b) { return b - a; });
      var clusters = [];
      var cur = [];
      var last = null;
      ys.forEach(function(y) {
        if (last != null && last - y > 22) {
          if (cur.length) clusters.push(cur);
          cur = [];
        }
        cur.push(y);
        last = y;
      });
      if (cur.length) clusters.push(cur);
      var names = [];
      clusters.forEach(function(group) {
        var text = group.map(function(y) {
          return rows[y].sort(function(a, b) { return a.x - b.x; }).map(function(i) { return i.t; }).join(' ');
        }).join(' ').replace(/\s+/g, ' ').trim();
        if (!junk(text, true) && text.length < 80) names.push(text);
      });
      return names;
    }
    function questionCriteria(items, header) {
      var rows = {};
      items.forEach(function(i) {
        if (i.y > header.y - 4) return;
        if (i.x >= header.xCut - 8) return;
        var key = Math.round(i.y);
        if (!rows[key]) rows[key] = [];
        rows[key].push(i);
      });
      var lines = Object.keys(rows).map(Number).sort(function(a, b) { return b - a; }).map(function(y) {
        return rows[y].sort(function(a, b) { return a.x - b.x; }).map(function(i) { return i.t; }).join(' ').replace(/\s+/g, ' ').trim();
      }).filter(function(t) { return t && !junk(t); });
      var blob = lines.join(' ');
      var criteria = [];
      if ((blob.match(/\?/g) || []).length >= 2) {
        blob.split('?').forEach(function(part) {
          var q = part.replace(/\s+/g, ' ').trim();
          if (q.length > 12 && !junk(q)) criteria.push(q + '?');
        });
      } else {
        lines.forEach(function(t) { if (t.length > 12) criteria.push(t); });
      }
      return criteria;
    }
    function verticalHolistic(items) {
      var cols = {};
      items.forEach(function(i) {
        var n = intOf(i);
        if (n < 1 || n > 5) return;
        var key = Math.round(i.x / 8) * 8;
        if (!cols[key]) cols[key] = [];
        cols[key].push(i);
      });
      var levels = null;
      Object.keys(cols).forEach(function(k) {
        var seen = {};
        cols[k].forEach(function(i) { seen[intOf(i)] = i; });
        var nums = Object.keys(seen).map(Number).sort(function(a, b) { return a - b; });
        if (nums.length < 3 || nums.length > 5) return;
        for (var i = 0; i < nums.length; i++) if (nums[i] !== i + 1) return;
        var arr = nums.map(function(n) { return seen[n]; });
        if (!levels || arr.length > levels.length) levels = arr;
      });
      if (!levels) return null;
      var max = levels[levels.length - 1];
      var x0 = levels[0].x;
      var ys = levels.map(function(i) { return i.y; }).sort(function(a, b) { return b - a; });
      var lines = items.filter(function(i) {
        if (intOf(i) || i.x < x0 + 18 || i.x > x0 + 280) return false;
        if (i.y > ys[0] + 28 || i.y < ys[ys.length - 1] - 55) return false;
        return true;
      }).map(function(i) {
        return { y: i.y, t: i.t };
      }).filter(function(i) { return !junk(i.t); });
      if (lines.length < levels.length * 3) return null;
      var bounds = [];
      for (var b = 0; b < ys.length - 1; b++) bounds.push((ys[b] + ys[b + 1]) / 2 - 14);
      var top = [];
      lines.forEach(function(line) {
        var idx = 0;
        while (idx < bounds.length && line.y <= bounds[idx]) idx++;
        if (idx === ys.length - 1) top.push(line);
      });
      top.sort(function(a, b) { return b.y - a.y; });
      var criteria = [];
      top.forEach(function(line) {
        var prev = criteria[criteria.length - 1];
        var done = prev && /[.?!]$/.test(prev.t.trim());
        if (!prev || prev.y - line.y > 22 || done) criteria.push({ y: line.y, t: line.t });
        else prev.t += ' ' + line.t;
      });
      var names = criteria.map(function(c) { return c.t.replace(/\s+/g, ' ').trim(); }).filter(function(t) { return t.length > 8; });
      if (names.length < 2) return null;
      return { title: titleOn(items, 'Bütüncül Puanlama Anahtarı'), criteria: names, scale_type: '1-' + intOf(max) };
    }
    function holistic(items) {
      var blob = fold(items.map(function(i) { return i.t; }).join(' '));
      if (blob.indexOf('cok iyi') < 0 || blob.indexOf('puan') < 0) return null;
      var rows = {};
      items.forEach(function(i) {
        var key = Math.round(i.y);
        if (!rows[key]) rows[key] = [];
        rows[key].push(i);
      });
      var list = Object.keys(rows).map(Number).sort(function(a, b) { return b - a; }).map(function(y) {
        var arr = rows[y].sort(function(a, b) { return a.x - b.x; });
        return {
          y: y,
          level: arr.filter(function(i) { return i.x < 140; }).map(function(i) { return i.t; }).join(' '),
          crit: arr.filter(function(i) { return i.x >= 145 && i.x < 370; }).map(function(i) { return i.t; }).join(' ')
        };
      });
      var centers = [];
      var pending = '', pendingY = 0;
      list.forEach(function(r) {
        if (!r.level) return;
        if (!pending || Math.abs(r.y - pendingY) > 24) pending = r.level;
        else pending += ' ' + r.level;
        pendingY = r.y;
        var f = fold(pending);
        var num = pending.match(/(\d+)\s*puan/i);
        if (num && (f.indexOf('iyi') >= 0 || f.indexOf('yeter') >= 0 || f.indexOf('gelis') >= 0 || f.indexOf('yeters') >= 0)) {
          centers.push({ y: r.y, score: parseInt(num[1], 10) });
          pending = '';
        }
      });
      if (!centers.length) return null;
      function joinWrap(prev, next) {
        var token = next.split(/\s+/)[0];
        var stem = token.replace(/[.,;:]+$/, '');
        var punct = token.slice(stem.length);
        var after = next.slice(token.length).replace(/^\s*/, '');
        var flat = fold(stem);
        if (/^(tir|mistir|dur|dir|de|da|te|ta)$/.test(flat)) return (prev + stem + punct + (after ? ' ' + after : '')).replace(/\s+/g, ' ').trim();
        return (prev + ' ' + next).replace(/\s+/g, ' ').trim();
      }
      var bullets = [];
      list.forEach(function(r) {
        if (!r.crit || fold(r.crit) === 'olcutler') return;
        var text = r.crit.replace(/^[●•]\s*/, '').trim();
        if (!text) return;
        var isNew = /^[●•]/.test(r.crit);
        if (isNew || !bullets.length) bullets.push({ y: r.y, text: text });
        else bullets[bullets.length - 1].text = joinWrap(bullets[bullets.length - 1].text, text);
      });
      var maxScore = centers.reduce(function(m, c) { return Math.max(m, c.score); }, 0);
      var criteria = [];
      bullets.forEach(function(b) {
        var best = centers[0], bestD = Math.abs(b.y - best.y);
        centers.forEach(function(c) { var d = Math.abs(b.y - c.y); if (d < bestD) { best = c; bestD = d; } });
        if (best.score === maxScore) criteria.push(b.text.replace(/\s+/g, ' ').trim());
      });
      criteria = criteria.filter(function(c) { return c.length > 8; });
      if (criteria.length < 2) return null;
      return { title: 'Bütüncül Puanlama Anahtarı', criteria: criteria, scale_type: maxScore >= 5 ? '1-5' : '1-4' };
    }
    function pageScale(items) {
      var vert = verticalHolistic(items);
      if (vert) return vert;
      var header = findScoreHeader(items);
      var yes = findYesNo(items);
      if (header && header.nums.length >= 3) {
        var numbered = numberedCriteria(items, header.xCut, header.y);
        if (numbered.length >= 3) {
          return { title: titleOn(items, header.max + ' Ölçek'), criteria: numbered, scale_type: '1-' + header.max, lastNo: numbered.length };
        }
        var names = leftNames(items, header);
        if (names.length >= 2) {
          return { title: titleOn(items, '1-' + header.max + ' Ölçek'), criteria: names, scale_type: '1-' + header.max };
        }
      }
      if (yes) {
        var numbered2 = numberedCriteria(items, yes.xCut, yes.y);
        var criteria = numbered2.length >= 3 ? numbered2 : questionCriteria(items, yes);
        if (criteria.length >= 2) return { title: titleOn(items, yes.mode === 'eh' ? 'Kontrol Listesi' : 'Değerlendirme Formu'), criteria: criteria, scale_type: yes.mode };
      }
      return holistic(items);
    }
    function continuation(items) {
      var nums = items.filter(function(i) { return intOf(i) >= 1; });
      if (nums.length < 2) return [];
      var x = nums.slice().sort(function(a, b) { return a.x - b.x; })[Math.floor(nums.length / 2)].x;
      var band = nums.filter(function(i) { return Math.abs(i.x - x) < 15; });
      if (band.length < 2) return [];
      return numberedCriteria(items, x + 260, 9999);
    }
    function parsePages(pages) {
      var scales = [];
      pages.forEach(function(items) {
        var found = pageScale(items);
        if (found) { scales.push(found); return; }
        if (!scales.length) return;
        var prev = scales[scales.length - 1];
        var more = continuation(items);
        if (more.length) prev.criteria = prev.criteria.concat(more);
      });
      return scales;
    }
    var pages = [];
    for (var p = 1; p <= doc.numPages; p++) {
        var page = await doc.getPage(p);
        var content = await page.getTextContent();
        var items = [];
        content.items.forEach(function(it) {
            if (!it.str || !String(it.str).trim()) return;
            var t = String(it.str).trim();
            items.push({ x: it.transform[4], y: it.transform[5], t: t, f: fold(t) });
        });
        pages.push(items);
    }
    return parsePages(pages).map(function(s) {
        return { title: s.title, criteria: s.criteria.slice(0, 40), scale_type: s.scale_type };
    });
}

function globalAddActivity() {
    openModal('Ölçek Yükle',
        '<select id="m-grade" class="auth-input" onchange="fillModalUnitsAct(this.value)"><option value="5">5. Sinif</option><option value="6" selected>6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="m-unit" class="auth-input" onchange="fillModalSectionsAct()"><option value="">Unite</option></select>' +
        '<select id="m-section" class="auth-input" onchange="fillModalActPick()"><option value="">Bolum</option></select>' +
        '<select id="m-act" class="auth-input"><option value="">Etkinlik (PDF için)</option></select>' +
        '<input type="file" id="m-file" class="auth-input" accept=".xlsx,.xls,.pdf">' +
        '<p style="font-size:12px;color:#94a3b8;margin:0;">PDF yüklerken etkinliği seç. Ölçek o etkinliğin altında açılır. Excel eskisi gibi.</p>',
    function() {
        var g = document.getElementById('m-grade').value;
        var u = document.getElementById('m-unit').value;
        var s = document.getElementById('m-section').value;
        var file = document.getElementById('m-file').files[0];
        if (!u || !s || !file) return alert('Tum alanlari doldurun');
        var reader = new FileReader();
        if (/\.pdf$/i.test(file.name)) {
            reader.onload = async function(e) {
                try {
                    var act = document.getElementById('m-act').value;
                    if (!act) return alert('PDF ölçeğin hangi etkinliğin altında duracağını seç.');
                    var parsedList = await parseScalesFromPdf(e.target.result);
                    parsedList = (parsedList || []).filter(function(p) { return p.criteria && p.criteria.length; });
                    if (!parsedList.length) return alert('Bu PDF içinde ölçek ölçütü bulunamadı.');
                    var rows = parsedList.map(function(parsed) {
                        return { grade: g, unit_name: u, section_name: s, activity_name: act + ' - ' + parsed.title, criteria: parsed.criteria, scale_type: parsed.scale_type };
                    });
                    var res = await supabaseClient.from('activities').insert(stampList(rows));
                    if (res.error) return alert(res.error.message);
                    await loadAllDataFromSupabase();
                    closeModal();
                    alert(rows.map(function(r) { return r.activity_name + ' (' + r.criteria.length + ' ölçüt)'; }).join('\n'));
                } catch (err) {
                    alert('Hata: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }
        reader.onload = async function(e) {
            try {
                var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                var count = 0;
                for (var si = 0; si < wb.SheetNames.length; si++) {
                    var sheet = wb.SheetNames[si];
                    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
                    var currentScale = null;
                    var currentType = '1-4';
                    for (var ri = 0; ri < rows.length; ri++) {
                        var row = rows[ri];
                        if (!row || !row[0]) continue;
                        var firstCell = String(row[0]);

                        if (firstCell.indexOf('📋') >= 0 || firstCell.toUpperCase().indexOf('RUBRİK') >= 0 || firstCell.toUpperCase().indexOf('LİSTESİ') >= 0 || firstCell.toUpperCase().indexOf('FORMU') >= 0) {
                            currentScale = firstCell.replace(/📋/g, '').trim();
                            var upper = currentScale.toUpperCase().replace(/İ/g,'I').replace(/Ş/g,'S').replace(/Ğ/g,'G').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C');
                            if (upper.indexOf('KONTROL') >= 0 || upper.indexOf('LISTESI') >= 0 || upper.indexOf('LISTE') >= 0) currentType = 'var-yok';
                            else if (upper.indexOf('FORMU') >= 0 || upper.indexOf('GOZLEM') >= 0 || upper.indexOf('OZ') >= 0 || upper.indexOf('AKRAN') >= 0) currentType = 'evet-hayir';
                            else currentType = '1-4';
                            continue;
                        }

                        if (currentScale && row.some(function(c) { return c && (String(c).indexOf('Okul No') >= 0 || String(c).indexOf('Adı Soyadı') >= 0); })) {
                            var crits = row.filter(function(c) {
                                if (!c) return false;
                                var s = String(c);
                                return s.indexOf('Okul No') < 0 && s.indexOf('Adı Soyadı') < 0 && s.indexOf('TOPLAM') < 0 && s.indexOf('BAŞARI') < 0 && s.indexOf('Değerlendiren') < 0 && s.indexOf('Akran') < 0;
                            });
                            if (crits.length && supabaseClient) {
                                await supabaseClient.from('activities').insert(stampList([{
                                    grade: g, unit_name: u, section_name: s,
                                    activity_name: sheet + ' - ' + currentScale,
                                    criteria: crits, scale_type: currentType
                                }]));
                                count++;
                            }
                            currentScale = null;
                        }
                    }
                    if (count === 0 && rows.length) {
                        await supabaseClient.from('activities').insert(stampList([{
                            grade: g, unit_name: u, section_name: s, activity_name: sheet,
                            criteria: ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'], scale_type: '1-4'
                        }]));
                        count++;
                    }
                }
                await loadAllDataFromSupabase();
                closeModal();
                alert(count + ' olcek yuklendi');
            } catch (err) {
                alert('Hata: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });
    fillModalUnitsAct('6');
}

function fillModalUnitsAct(grade) {
    var sel = document.getElementById('m-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unite</option>';
    (fenData[grade]?.units || []).forEach(function(u) {
        sel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
    });
    fillModalSectionsAct();
}

function fillModalSectionsAct() {
    var g = document.getElementById('m-grade')?.value;
    var u = document.getElementById('m-unit')?.value;
    var sel = document.getElementById('m-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">Bolum</option>';
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit) unit.sections.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
    });
    fillModalActPick();
}

function fillModalActPick() {
    var g = document.getElementById('m-grade')?.value;
    var u = document.getElementById('m-unit')?.value;
    var sec = document.getElementById('m-section')?.value;
    var sel = document.getElementById('m-act');
    if (!sel) return;
    sel.innerHTML = '<option value="">Etkinlik (PDF için)</option>';
    var seen = {};
    (fenData[g]?.activities || []).forEach(function(a) {
        if (a.unit !== u || a.section !== sec) return;
        var parts = (a.name || '').split(' - ');
        var base = parts.length >= 2 ? parts[0] + ' - ' + parts[1] : a.name;
        if (!base || seen[base]) return;
        seen[base] = true;
        var opt = document.createElement('option');
        opt.value = base;
        opt.textContent = base;
        sel.appendChild(opt);
    });
}

async function saveActivity() {
    var grade = document.getElementById('act-grade').value;
    var unit = document.getElementById('act-unit').value.trim();
    var section = document.getElementById('act-section').value.trim();
    var name = document.getElementById('act-name').value.trim();
    if (!unit || !section || !name) return alert('Tüm alanları doldurun');
    if (supabaseClient) {
        var res = await supabaseClient.from('activities').insert(stampList([{
            grade: grade, unit_name: unit, section_name: section, activity_name: name,
            criteria: ['1. Kriter','2. Kriter','3. Kriter','4. Kriter'], scale_type: '1-4'
        }]));
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
            await supabaseClient.from('report_templates').delete().eq('teacher_id', ownerId()).eq('grade', g).eq('unit_name', u).eq('section_name', s);
            await supabaseClient.from('report_templates').insert(stampList([{ grade: g, unit_name: u, section_name: s, report_text: t }]));
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
    fillRepSections();
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

function actsInScope(grade, unit, section, base) {
    return (fenData[grade]?.activities || []).filter(function(a) {
        if ((a.unit || '').trim() !== (unit || '').trim()) return false;
        if (section && (a.section || '').trim() !== section.trim()) return false;
        if (!base) return true;
        var name = (a.name || '').trim();
        return name === base || name.indexOf(base + ' -') === 0;
    });
}

async function wipeStudentMarks(grade, quizExact, quizPrefix, scaleNames) {
    if (!supabaseClient) return;
    var res = await supabaseClient.from('students').select('id,quiz,scale').eq('teacher_id', ownerId()).eq('grade', grade);
    if (res.error) return;
    var rows = res.data || [];
    for (var i = 0; i < rows.length; i++) {
        var quiz = Object.assign({}, rows[i].quiz || {});
        var scale = Object.assign({}, rows[i].scale || {});
        var changed = false;
        Object.keys(quiz).forEach(function(k) {
            if (quizExact.indexOf(k) >= 0 || (quizPrefix && k.indexOf(quizPrefix) === 0)) {
                delete quiz[k];
                changed = true;
            }
        });
        scaleNames.forEach(function(n) {
            if (scale[n] !== undefined) { delete scale[n]; changed = true; }
        });
        if (changed) {
            await supabaseClient.from('students').update({ quiz: quiz, scale: scale }).eq('id', rows[i].id);
        }
    }
}

async function deleteLessonTree(grade, unit, section) {
    var q = supabaseClient.from('lesson_contents').select('id').eq('teacher_id', ownerId()).eq('grade', grade).eq('unit_name', unit);
    if (section) q = q.eq('section_name', section);
    var found = await q;
    if (found.error) throw new Error(found.error.message);
    var ids = (found.data || []).map(function(r) { return r.id; });
    if (!ids.length) return;
    await supabaseClient.from('quiz_results').delete().in('content_id', ids);
    await supabaseClient.from('student_progress').delete().in('content_id', ids);
    var del = await supabaseClient.from('lesson_contents').delete().in('id', ids);
    if (del.error) throw new Error(del.error.message);
}

async function purgeScope(grade, unit, section, names, dropWhat) {
    var tid = ownerId();
    if (names && names.length) {
        var actDel = await supabaseClient.from('activities').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit).eq('section_name', section).in('activity_name', names);
        if (actDel.error) throw new Error(actDel.error.message);
        await wipeStudentMarks(grade, [], '', names);
    }
    if (dropWhat === 'section' || dropWhat === 'unit') {
        await deleteLessonTree(grade, unit, dropWhat === 'section' ? section : '');
        var rep = supabaseClient.from('report_templates').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit);
        if (dropWhat === 'section') rep = rep.eq('section_name', section);
        var repRes = await rep;
        if (repRes.error) throw new Error(repRes.error.message);
        if (dropWhat === 'unit') {
            var actAll = await supabaseClient.from('activities').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit);
            if (actAll.error) throw new Error(actAll.error.message);
            var unitDel = await supabaseClient.from('units_sections').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit);
            if (unitDel.error) throw new Error(unitDel.error.message);
            await wipeStudentMarks(grade, [], unit + '_', names || []);
        } else {
            var secActs = await supabaseClient.from('activities').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit).eq('section_name', section);
            if (secActs.error) throw new Error(secActs.error.message);
            var secDel = await supabaseClient.from('units_sections').delete().eq('teacher_id', tid).eq('grade', grade).eq('unit_name', unit).eq('section_name', section);
            if (secDel.error) throw new Error(secDel.error.message);
            await wipeStudentMarks(grade, [unit + '_' + section], '', names || []);
        }
    }
}

function globalDeleteManagement() {
    openModal('Silme Yonetimi',
        '<select id="d-grade" class="auth-input" onchange="toggleDel()"><option value="5">5. Sinif</option><option value="6">6. Sinif</option><option value="7">7. Sinif</option><option value="8">8. Sinif</option></select>' +
        '<select id="d-type" class="auth-input" onchange="toggleDel()"><option value="unit">Unite</option><option value="section">Bolum</option><option value="activity">Etkinlik</option><option value="scale">Olcek</option><option value="report">Rapor</option></select>' +
        '<div id="d-target-area" style="margin-top:10px;"></div>',
    async function() {
        var g = document.getElementById('d-grade').value;
        var t = document.getElementById('d-type').value;
        if (t === 'unit') {
            var u = document.getElementById('d-unit').value;
            if (!u) return alert('Unite secin');
            var unitActs = actsInScope(g, u, '', '');
            try {
                if (supabaseClient) await purgeScope(g, u, '', unitActs.map(function(a) { return a.name; }), 'unit');
            } catch (err) { return alert(err.message); }
            await loadAllDataFromSupabase(); closeModal(); alert('Unite ve bagli her sey silindi');
        } else if (t === 'section') {
            var u2 = document.getElementById('d-unit').value;
            var s = document.getElementById('d-section').value;
            if (!u2 || !s) return alert('Unite ve bolum secin');
            var secActs = actsInScope(g, u2, s, '');
            try {
                if (supabaseClient) await purgeScope(g, u2, s, secActs.map(function(a) { return a.name; }), 'section');
            } catch (err) { return alert(err.message); }
            await loadAllDataFromSupabase(); closeModal(); alert('Bolum, olcekler ve notlar silindi');
        } else if (t === 'activity') {
            var u3 = document.getElementById('d-unit')?.value;
            var s3 = document.getElementById('d-section')?.value;
            var a = document.getElementById('d-act')?.value;
            if (!u3 || !s3 || !a) return alert('Unite, bolum ve etkinlik secin');
            var names = actsInScope(g, u3, s3, a).map(function(x) { return x.name; });
            if (names.indexOf(a) < 0) names.push(a);
            try {
                if (supabaseClient) await purgeScope(g, u3, s3, names, '');
            } catch (err) { return alert(err.message); }
            await loadAllDataFromSupabase(); closeModal(); alert('Etkinlik ve bagli olcekler silindi');
        } else if (t === 'scale') {
            var u5 = document.getElementById('d-unit')?.value;
            var s5 = document.getElementById('d-section')?.value;
            var scaleName = document.getElementById('d-scale')?.value;
            if (!u5 || !s5 || !scaleName) return alert('Unite, bolum ve olcek secin');
            try {
                if (supabaseClient) await purgeScope(g, u5, s5, [scaleName], '');
            } catch (err) { return alert(err.message); }
            await loadAllDataFromSupabase(); closeModal(); alert('Olcek silindi');
        } else if (t === 'report') {
            var u4 = document.getElementById('d-unit')?.value;
            var s4 = document.getElementById('d-section')?.value;
            var id = document.getElementById('d-rep')?.value;
            if (!u4 || !s4 || !id) return alert('Unite, bolum ve rapor secin');
            if (supabaseClient) {
                var repDel = await supabaseClient.from('report_templates').delete().eq('id', id).eq('teacher_id', ownerId());
                if (repDel.error) return alert(repDel.error.message);
            }
            await loadAllDataFromSupabase(); closeModal(); alert('Rapor silindi');
        }
    });
    toggleDel();
}

async function toggleDel() {
    var g = document.getElementById('d-grade').value;
    var t = document.getElementById('d-type').value;
    var area = document.getElementById('d-target-area');
    var units = fenData[g]?.units || [];
    if (t === 'unit') {
        var opts = '<option value="">-- Unite Secin --</option>';
        units.forEach(function(u) { opts += '<option value="' + u.name + '">' + u.name + '</option>'; });
        area.innerHTML = '<select id="d-unit" class="auth-input">' + opts + '</select>';
    } else if (t === 'section') {
        var opts2 = '<option value="">-- Unite Secin --</option>';
        units.forEach(function(u) { opts2 += '<option value="' + u.name + '">' + u.name + '</option>'; });
        area.innerHTML = '<select id="d-unit" class="auth-input" onchange="fillDelSecs()">' + opts2 + '</select><select id="d-section" class="auth-input"><option value="">-- Bolum Secin --</option></select>';
    } else if (t === 'activity' || t === 'scale') {
        var uOptsA = '<option value="">-- Unite Secin --</option>';
        units.forEach(function(u) { uOptsA += '<option value="' + u.name + '">' + u.name + '</option>'; });
        area.innerHTML = '<select id="d-unit" class="auth-input" onchange="fillDelSecs()">' + uOptsA + '</select>' +
            '<select id="d-section" class="auth-input" onchange="fillDelActs()"><option value="">-- Once Unite Secin --</option></select>' +
            '<select id="d-act" class="auth-input" onchange="fillDelScales()"><option value="">-- Once Bolum Secin --</option></select>' +
            (t === 'scale' ? '<select id="d-scale" class="auth-input"><option value="">-- Once Etkinlik Secin --</option></select>' : '');
    } else if (t === 'report') {
        var uOptsR = '<option value="">-- Unite Secin --</option>';
        units.forEach(function(u) { uOptsR += '<option value="' + u.name + '">' + u.name + '</option>'; });
        area.innerHTML = '<select id="d-unit" class="auth-input" onchange="fillDelSecs()">' + uOptsR + '</select>' +
            '<select id="d-section" class="auth-input" onchange="fillDelReps()"><option value="">-- Once Unite Secin --</option></select>' +
            '<select id="d-rep" class="auth-input"><option value="">-- Once Bolum Secin --</option></select>';
    }
}

function fillDelSecs() {
    var g = document.getElementById('d-grade').value;
    var t = document.getElementById('d-type').value;
    var u = document.getElementById('d-unit').value;
    var sel = document.getElementById('d-section');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Bolum Secin --</option>';
    if (!u) return;
    var unit = fenData[g]?.units.find(function(x) { return x.name === u; });
    if (unit && unit.sections && unit.sections.length > 0) {
        unit.sections.forEach(function(s) {
            sel.innerHTML += '<option value="' + s + '">' + s + '</option>';
        });
    } else {
        sel.innerHTML += '<option value="Genel">Genel</option>';
    }
    if (t === 'activity' || t === 'scale') fillDelActs();
    if (t === 'report') fillDelReps();
}

function fillDelActs() {
    var g = document.getElementById('d-grade').value;
    var t = document.getElementById('d-type')?.value;
    var u = document.getElementById('d-unit')?.value;
    var s = document.getElementById('d-section')?.value;
    var sel = document.getElementById('d-act');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Etkinlik Secin --</option>';
    if (!u || !s) return;
    var acts = (fenData[g]?.activities || []).filter(function(a) {
        return a.unit === u && a.section === s;
    });
    var seen = {};
    acts.forEach(function(a) {
        var rawName = (a.name || '').trim();
        if (!rawName) return;
        var parts = rawName.split(' - ');
        var baseName = parts.length >= 2 ? (parts[0] + ' - ' + parts[1]).trim() : rawName;
        if (!seen[baseName]) {
            seen[baseName] = true;
            var opt = document.createElement('option');
            opt.value = baseName;
            opt.textContent = baseName;
            sel.appendChild(opt);
        }
    });
    if (t === 'scale') fillDelScales();
}

function fillDelScales() {
    var g = document.getElementById('d-grade').value;
    var u = document.getElementById('d-unit')?.value;
    var s = document.getElementById('d-section')?.value;
    var base = document.getElementById('d-act')?.value;
    var sel = document.getElementById('d-scale');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Olcek Secin --</option>';
    if (!u || !s || !base) return;
    actsInScope(g, u, s, base).forEach(function(a) {
        var short = a.name.replace(base, '').replace(/^[\s-]+/, '');
        if (!short) short = a.name;
        var opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = short;
        sel.appendChild(opt);
    });
}

async function fillDelReps() {
    var g = document.getElementById('d-grade').value;
    var u = document.getElementById('d-unit')?.value;
    var s = document.getElementById('d-section')?.value;
    var sel = document.getElementById('d-rep');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Rapor Secin --</option>';
    if (!u || !s || !supabaseClient) return;
    var res = await supabaseClient.from('report_templates').select('*').eq('teacher_id', ownerId()).eq('grade', g).eq('unit_name', u).eq('section_name', s);
    (res.data || []).forEach(function(r) {
        sel.innerHTML += '<option value="' + r.id + '">' + r.unit_name + ' - ' + r.section_name + '</option>';
    });
}

function parseBulkStudents(raw) {
    var lines = String(raw || '').replace(/\u00a0/g, ' ').split(/\r?\n/);
    var found = [];
    function junk(name) {
        var u = name.toLocaleUpperCase('tr-TR');
        if (u.indexOf('NOT BİLG') >= 0 || u.indexOf('NOT BILG') >= 0) return true;
        if (u.indexOf('SINAV') >= 0 || u.indexOf('SINAV') >= 0 || u.indexOf('PUAN') >= 0) return true;
        if (u.indexOf('OKUL NO') >= 0 || u.indexOf('ADI SOYAD') >= 0) return true;
        if (u.indexOf('KAYIT') >= 0 && u.indexOf('BULUNDU') >= 0) return true;
        if (!/[A-ZÇĞİÖŞÜ]/.test(u)) return true;
        if (u.replace(/[^A-ZÇĞİÖŞÜ]/g, '').length < 3) return true;
        return false;
    }
    function takeName(text) {
        var raw = String(text || '');
        var upper = raw.toLocaleUpperCase('tr-TR');
        if (upper.indexOf('NOT BİLG') >= 0 || upper.indexOf('NOT BILG') >= 0) return '';
        if (upper.indexOf('OKUL NO') >= 0 || upper.indexOf('ADI SOYAD') >= 0) return '';
        var cut = raw.split('\t')[0].split(/\s{2,}/)[0];
        var kept = [];
        cut.split(/\s+/).forEach(function(tok) {
            if (!tok) return;
            var tu = tok.toLocaleUpperCase('tr-TR');
            if (/^\d+$/.test(tok) || tu === 'G') return;
            kept.push(tok);
        });
        return kept.join(' ').trim();
    }
    lines.forEach(function(line) {
        if (!line.trim()) return;
        var parts = line.split('\t').map(function(p) { return p.trim(); });
        var no = NaN;
        var name = '';
        if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
            no = parseInt(parts[0], 10);
            name = parts[1];
        } else {
            var spaced = line.trim().split(/\s{2,}/);
            if (spaced.length >= 2 && /^\d+$/.test(spaced[0])) {
                no = parseInt(spaced[0], 10);
                name = spaced[1];
            } else {
                var simple = line.trim().match(/^(\d+)\s+(.+)$/);
                if (!simple) return;
                no = parseInt(simple[1], 10);
                name = takeName(simple[2]);
            }
        }
        name = takeName(name).toLocaleUpperCase('tr-TR');
        if (!no || no < 1 || no > 9999 || junk(name)) return;
        found.push({ no: no, name: name });
    });
    var map = {};
    found.forEach(function(s) {
        if (!map[s.no] || s.name.length > map[s.no].name.length) map[s.no] = s;
    });
    return Object.keys(map).map(function(k) { return map[k]; });
}

function openBulkStudentModal(grade, branchName) {
    openModal('Toplu Öğrenci (e-Okul)',
        '<p style="font-size:12px;color:#94a3b8;margin-bottom:8px;">e-Okul tablosunun tamamını yapıştır. Sadece okul no ve ad soyad alınır.</p>' +
        '<textarea id="m-bulk" class="auth-input" style="height:160px;font-family:monospace;" placeholder="201 Ali Yılmaz"></textarea>',
    async function() {
        var raw = document.getElementById('m-bulk').value.trim();
        if (!raw) return;
        var parsed = parseBulkStudents(raw);
        if (!parsed.length) return alert('Öğrenci bulunamadı. Tabloda okul no ve ad soyad olmalı.');
        var existing = {};
        (fenData[grade]?.branches?.[branchName] || []).forEach(function(s) {
            var nm = String(s.name || '').toLocaleUpperCase('tr-TR');
            if (nm.indexOf('NOT BİLG') >= 0 || nm.indexOf('NOT BILG') >= 0) return;
            existing[parseInt(s.no, 10)] = true;
        });
        var toInsert = parsed.filter(function(s) { return !existing[s.no]; }).map(function(s) {
            return { grade: grade, branch: branchName, school_no: s.no, name: s.name, plus: 0, minus: 0, quiz: {}, scale: {} };
        });
        if (supabaseClient) {
            await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', branchName).or('name.ilike.%Not Bilgisi%,name.ilike.%NOT BILGISI%,name.ilike.%NOT BİLGİSİ%');
            if (toInsert.length) {
                var res = await supabaseClient.from('students').insert(stampList(toInsert));
                if (res.error) return alert(res.error.message);
            }
        }
        await loadAllDataFromSupabase();
        closeModal();
        loadBranchTabContent('students', grade, branchName);
        alert(toInsert.length + ' öğrenci eklendi. Not satırları ayıklandı.');
    });
}

function validateScoreInput(el) {
    var v = el.value.trim().toUpperCase();
    if (v === '' || v === 'G') return;
    if (!/^\d{1,3}$/.test(v)) {
        el.value = v.replace(/[^0-9]/g, '').slice(0, 3);
    }
    var n = parseInt(el.value);
    if (!isNaN(n) && n > 100) el.value = '100';
}

// ====================== ÖĞRENCİ İLERLEME RAPORU ======================
function openStudentProgressPage() {
    var panel = document.getElementById('grade-detail-panel');
    panel.style.display = 'flex';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';

    var gradeOpts = '';
    ['5','6','7','8'].forEach(function(g) {
        gradeOpts += '<option value="' + g + '">' + g + '. Sınıf</option>';
    });

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>Öğrenci İlerlemesi</h1></div>' +
            '<div>' +
                '<button onclick="openManagementMenu()" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
                '<button onclick="logout()" class="logout-btn">Çıkış</button>' +
            '</div>' +
        '</header>' +
        '<section class="dashboard-content" style="max-width:1000px;margin:0 auto;">' +
            '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
                '<select id="prog-grade" class="auth-input" style="width:auto;" onchange="fillProgBranches()">' + gradeOpts + '</select>' +
                '<select id="prog-branch" class="auth-input" style="width:auto;" onchange="loadStudentProgressTable()"><option value="">-- Şube Seçin --</option></select>' +
                '<select id="prog-unit" class="auth-input" style="width:auto;" onchange="loadStudentProgressTable()"><option value="ALL">Tüm Üniteler</option></select>' +
            '</div>' +
            '<div id="student-progress-table"></div>' +
        '</section>';

    fillProgBranches();
}

function fillProgBranches() {
    var grade = document.getElementById('prog-grade')?.value || '5';
    var bSel = document.getElementById('prog-branch');
    var uSel = document.getElementById('prog-unit');
    if (bSel) {
        bSel.innerHTML = '';
        var branches = Object.keys(fenData[grade]?.branches || {});
        branches.forEach(function(b) {
            var short = b.indexOf('/') >= 0 ? b.split('/')[1] : b;
            bSel.innerHTML += '<option value="' + b + '">' + short + '</option>';
        });
    }
    if (uSel) {
        uSel.innerHTML = '<option value="ALL">Tüm Üniteler</option>';
        (fenData[grade]?.units || []).forEach(function(u) {
            uSel.innerHTML += '<option value="' + u.name + '">' + u.name + '</option>';
        });
    }
    loadStudentProgressTable();
}

async function loadStudentProgressTable() {
    var grade = document.getElementById('prog-grade')?.value || '5';
    var branch = document.getElementById('prog-branch')?.value || '';
    var unit = document.getElementById('prog-unit')?.value || 'ALL';
    var container = document.getElementById('student-progress-table');
    if (!container) return;

    var students = (fenData[grade]?.branches?.[branch] || []).slice().sort(function(a,b){ return parseInt(a.no)-parseInt(b.no); });
    if (students.length === 0) {
        container.innerHTML = '<p style="color:#64748b;font-size:13px;">Bu şubede öğrenci bulunamadı.</p>';
        return;
    }

    var allLessons = (fenData[grade]?.lessons || []).filter(function(l) {
        return unit === 'ALL' || l.unit === unit;
    });

    var typeLessonMap = {
        pptx: allLessons.filter(function(l) { return l.type === 'pptx'; }),
        video: allLessons.filter(function(l) { return l.type === 'video'; }),
        experiment: allLessons.filter(function(l) { return l.type === 'experiment'; }),
        quiz: allLessons.filter(function(l) { return l.type === 'quiz'; })
    };

    var studentCompletedMap = {};
    if (supabaseClient) {
        var studentIds = students.map(function(s) { return s.id; }).filter(Boolean);
        if (studentIds.length > 0) {
            var { data: progRows } = await supabaseClient
                .from('student_progress')
                .select('student_id,content_id')
                .in('student_id', studentIds)
                .eq('is_completed', true);
            (progRows || []).forEach(function(r) {
                if (!studentCompletedMap[r.student_id]) studentCompletedMap[r.student_id] = {};
                studentCompletedMap[r.student_id][r.content_id] = true;
            });
        }
    }

    function renderStatusIcon(doneSet, typeKey) {
        var list = typeLessonMap[typeKey] || [];
        if (list.length === 0) {
            return '<span style="color:#64748b;font-weight:700;">-</span>';
        }
        var hasCompleted = list.some(function(item) { return !!doneSet[item.id]; });
        if (hasCompleted) {
            return '<span style="color:#22c55e;font-weight:700;font-size:16px;">✓</span>';
        }
        return '<span style="color:#ef4444;font-weight:700;font-size:16px;">✗</span>';
    }

    var rows = '';
    students.forEach(function(s) {
        var doneSet = studentCompletedMap[s.id] || {};
        rows += '<tr>' +
            '<td style="text-align:center;">' + s.no + '</td>' +
            '<td style="text-align:left;font-weight:600;">' + s.name + '</td>' +
            '<td style="text-align:center;">' + renderStatusIcon(doneSet, 'pptx') + '</td>' +
            '<td style="text-align:center;">' + renderStatusIcon(doneSet, 'video') + '</td>' +
            '<td style="text-align:center;">' + renderStatusIcon(doneSet, 'experiment') + '</td>' +
            '<td style="text-align:center;">' + renderStatusIcon(doneSet, 'quiz') + '</td>' +
        '</tr>';
    });

    container.innerHTML =
        '<div style="overflow-x:auto;">' +
            '<table class="data-table">' +
                '<thead><tr>' +
                    '<th>No</th>' +
                    '<th style="text-align:left;">Ad Soyad</th>' +
                    '<th>Konu Anlatımı</th>' +
                    '<th>Video</th>' +
                    '<th>Deney</th>' +
                    '<th>Quiz</th>' +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table>' +
        '</div>';
}

// ====================== BAŞLAT ======================
window.addEventListener('DOMContentLoaded', async function() {
    var tEmail = document.getElementById('teacher-email');
    var tPass = document.getElementById('teacher-password');
    if (tEmail) {
        tEmail.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); teacherLogin(); }
        });
    }
    if (tPass) {
        tPass.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); teacherLogin(); }
        });
    }
    await loadPortalCatalog();
    var sessionRes = supabaseClient ? await supabaseClient.auth.getSession() : { data: {} };
    if (sessionRes.data && sessionRes.data.session) {
        var bound = await bindTeacher(sessionRes.data.session.user);
        if (bound) {
            await loadAllDataFromSupabase();
            restoreStateFromSession();
            return;
        }
    }
    readStudentScope();
    if (studentScope && studentScope.teacherId) {
        await loadAllDataFromSupabase();
    }
    fillStudentSchools();
    restoreStateFromSession();
});
