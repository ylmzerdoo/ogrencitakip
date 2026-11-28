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
var DEFAULT_YEAR = '2026-2027';

var SUBJECTS = [
    { id: 'Türkçe', title: 'TÜRKÇE DERSİ' },
    { id: 'Matematik', title: 'MATEMATİK DERSİ' },
    { id: 'Fen Bilimleri', title: 'FEN BİLİMLERİ DERSİ' },
    { id: 'Sosyal Bilgiler', title: 'SOSYAL BİLGİLER DERSİ' },
    { id: 'T.C. İnkılâp Tarihi ve Atatürkçülük', title: 'T.C. İNKILÂP TARİHİ VE ATATÜRKÇÜLÜK DERSİ' },
    { id: 'Yabancı Dil (İngilizce)', title: 'YABANCI DİL (İNGİLİZCE) DERSİ' },
    { id: 'Din Kültürü ve Ahlak Bilgisi', title: 'DİN KÜLTÜRÜ VE AHLAK BİLGİSİ DERSİ' }
];

var SUBJECT_ALIASES = {
    'Fen': 'Fen Bilimleri',
    'İngilizce': 'Yabancı Dil (İngilizce)',
    'Din Kültürü': 'Din Kültürü ve Ahlak Bilgisi'
};

var BADGE_TITLES = {
    'Fen Bilimleri': ['Fen Ustası', 'Bilim İnsanı', 'Araştırmacı', 'Meraklı'],
    'Türkçe': ['Dil Ustası', 'Yazar', 'Kitap Kurdu', 'Meraklı'],
    'Matematik': ['Matematik Ustası', 'Problem Avcısı', 'Hesapçı', 'Meraklı'],
    'Yabancı Dil (İngilizce)': ['Dil Ustası', 'Konuşmacı', 'Kelime Avcısı', 'Meraklı'],
    'Sosyal Bilgiler': ['Sosyal Ustası', 'Tarihçi', 'Gözlemci', 'Meraklı'],
    'T.C. İnkılâp Tarihi ve Atatürkçülük': ['Tarih Ustası', 'Araştırmacı', 'Gözlemci', 'Meraklı'],
    'Din Kültürü ve Ahlak Bilgisi': ['Bilge', 'Araştırmacı', 'Gözlemci', 'Meraklı']
};

function canonicalSubject(subject) {
    return SUBJECT_ALIASES[subject] || subject || '';
}

function subjectsMatch(a, b) {
    return canonicalSubject(a) === canonicalSubject(b);
}

var currentTeacher = null;
var studentScope = null;
var portalCatalog = { schools: [], teachers: [], branches: [] };

function subjectTitle(subject, grade) {
    var name = canonicalSubject(subject);
    if (name === 'Sosyal Bilgiler' && String(grade || '') === '8') name = 'T.C. İnkılâp Tarihi ve Atatürkçülük';
    var found = SUBJECTS.find(function(s) { return s.id === name; });
    return found ? found.title : 'DERS';
}

function activeSubject() {
    if (studentScope && studentScope.subject) return canonicalSubject(studentScope.subject);
    if (currentTeacher && currentTeacher.subject) return canonicalSubject(currentTeacher.subject);
    return 'Fen Bilimleri';
}

function getSubjectLine(grade) {
    return subjectTitle(activeSubject(), grade);
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
    sel.innerHTML = '<option value="">-- Ders Seçin --</option>';
    var seen = {};
    portalCatalog.teachers.forEach(function(t) {
        if (t.school_id !== schoolId) return;
        var label = canonicalSubject(t.subject);
        if (!label || seen[label]) return;
        seen[label] = true;
        sel.innerHTML += '<option value="' + label + '">' + label + '</option>';
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
        return t.school_id === schoolId && subjectsMatch(t.subject, subject);
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
        return t.school_id === schoolId && subjectsMatch(t.subject, subject);
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
        academic_year: school.academic_year || DEFAULT_YEAR,
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
    var yearPrefill = localStorage.getItem('fen_academic_year') || DEFAULT_YEAR;
    var opts = SUBJECTS.map(function(s) {
        var selected = canonicalSubject(row.subject || 'Fen Bilimleri') === s.id ? ' selected' : '';
        return '<option value="' + s.id + '"' + selected + '>' + s.id + '</option>';
    }).join('');
    openModal('Okulunu Bağla',
        '<p style="font-size:13px;color:#cbd5e1;margin-bottom:8px;">' + (row.full_name || '') + ' kaydı var. Okul ve ders seçilince panele girersin.</p>' +
        '<input id="setup-school" class="auth-input" placeholder="Okul adı">' +
        '<input id="setup-year" class="auth-input" placeholder="Eğitim yılı" value="' + yearPrefill.replace(/"/g, '') + '">' +
        '<select id="setup-subject" class="auth-input">' + opts + '</select>',
    async function() {
        var schoolName = document.getElementById('setup-school').value.trim();
        var year = document.getElementById('setup-year').value.trim() || DEFAULT_YEAR;
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
    var yearPrefill = localStorage.getItem('fen_academic_year') || DEFAULT_YEAR;
    var opts = SUBJECTS.map(function(s) {
        return '<option value="' + s.id + '"' + (s.id === 'Fen Bilimleri' ? ' selected' : '') + '>' + s.id + '</option>';
    }).join('');
    openModal('İlk Kurulum',
        '<p style="font-size:13px;color:#cbd5e1;margin-bottom:8px;">Bu hesap yönetici olacak. Mevcut ders verisi sana bağlanır.</p>' +
        '<input id="setup-name" class="auth-input" placeholder="Ad Soyad" value="Erdoğan Yılmaz">' +
        '<input id="setup-school" class="auth-input" placeholder="Okul adı" value="' + schoolPrefill.replace(/"/g, '') + '">' +
        '<input id="setup-year" class="auth-input" placeholder="Eğitim yılı" value="' + yearPrefill.replace(/"/g, '') + '">' +
        '<select id="setup-subject" class="auth-input">' + opts + '</select>',
    async function() {
        var name = document.getElementById('setup-name').value.trim();
        var schoolName = document.getElementById('setup-school').value.trim();
        var year = document.getElementById('setup-year').value.trim() || DEFAULT_YEAR;
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
    if (h) h.textContent = (currentTeacher && currentTeacher.subject ? canonicalSubject(currentTeacher.subject) : 'Öğretmen') + ' Paneli';
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
        return t.school_id === currentTeacher.school_id && subjectsMatch(t.subject, currentTeacher.subject) && t.id !== currentTeacher.id;
    });
}

async function branchTaken(grade, fullName) {
    if (!supabaseClient || !currentTeacher) return false;
    var rows = await supabaseClient.from('branches').select('teacher_id, branch_name, grade').eq('grade', grade).eq('branch_name', fullName);
    var teachers = await supabaseClient.from('teachers').select('id, school_id, subject');
    return (rows.data || []).some(function(r) {
        var t = (teachers.data || []).find(function(x) { return x.id === r.teacher_id; });
        return t && t.school_id === currentTeacher.school_id && subjectsMatch(t.subject, currentTeacher.subject);
    });
}

function contentCopyKey(table, row) {
    function bit(value) { return String(value == null ? '' : value).trim(); }
    if (table === 'units_sections') return [row.grade, row.unit_name, row.section_name].map(bit).join('|');
    if (table === 'lesson_contents') return [row.grade, row.unit_name, row.section_name, row.content_type, row.title, row.file_url, row.experiment_url, row.file_path].map(bit).join('|');
    if (table === 'activities') return [row.grade, row.unit_name, row.section_name, row.activity_name, row.scale_type, JSON.stringify(row.criteria || [])].map(bit).join('|');
    if (table === 'report_templates') return [row.grade, row.unit_name, row.section_name, row.report_text].map(bit).join('|');
    return bit(row.id);
}
async function rowsOfTeacher(table, teacherId, grade) {
    var all = [];
    var from = 0;
    while (true) {
        var q = supabaseClient.from(table).select('*').eq('teacher_id', teacherId);
        if (grade) q = q.eq('grade', String(grade));
        var res = await q.range(from, from + 999);
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < 1000) break;
        from += 1000;
    }
    return all;
}
async function dedupeTransferredRows() {
    if (!supabaseClient || !currentTeacher || window._contentDeduped) return 0;
    window._contentDeduped = true;
    var tables = ['units_sections', 'lesson_contents', 'activities', 'report_templates'];
    var removed = 0;
    for (var t = 0; t < tables.length; t++) {
        var table = tables[t];
        var rows = await rowsOfTeacher(table, currentTeacher.id);
        rows.sort(function(a, b) { return String(a.created_at || '').localeCompare(String(b.created_at || '')); });
        var seen = {};
        var drop = [];
        rows.forEach(function(row) {
            var key = contentCopyKey(table, row);
            if (seen[key]) drop.push(row.id);
            else seen[key] = true;
        });
        for (var i = 0; i < drop.length; i += 80) {
            await supabaseClient.from(table).delete().in('id', drop.slice(i, i + 80));
        }
        removed += drop.length;
    }
    if (removed) await loadAllDataFromSupabase();
    return removed;
}

async function openTransferBranch(grade, branchName) {
    var others = await sameSubjectTeachers();
    if (!others.length) return alert('Aynı okul ve derste devredilecek başka öğretmen yok.');
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
                var haveRows = await rowsOfTeacher(table, newId, grade);
                var have = {};
                haveRows.forEach(function(row) { have[contentCopyKey(table, row)] = true; });
                var copies = rows.map(function(r) {
                    var c = Object.assign({}, r);
                    delete c.id;
                    delete c.created_at;
                    delete c.updated_at;
                    c.teacher_id = newId;
                    c.school_id = schoolId;
                    return c;
                }).filter(function(c) { return !have[contentCopyKey(table, c)]; });
                if (copies.length) await supabaseClient.from(table).insert(copies);
            }
        }
        closeModal();
        await loadAllDataFromSupabase();
        await loadPortalCatalog();
        alert('Şube devredildi.');
        openGradeManagement(grade, false);
    });
}

function currentPortalYear() {
    var saved = '';
    (portalCatalog.schools || []).some(function(s) {
        if (s.academic_year) {
            saved = s.academic_year;
            return true;
        }
        return false;
    });
    return saved || localStorage.getItem('fen_academic_year') || DEFAULT_YEAR;
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
    var portalYear = String(currentPortalYear()).replace(/"/g, '');
    var schoolList = portalCatalog.schools.map(function(s) {
        var mine = currentTeacher && s.id === currentTeacher.school_id;
        var deps = String(s.deputies || '').split('\n').map(function(name) { return name.trim(); }).filter(Boolean);
        var staff = [];
        if (s.principal) staff.push('Müdür: ' + s.principal);
        if (deps.length) staff.push('Müdür yrd: ' + deps.join(', '));
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">' +
            '<span>' + s.name + (mine ? ' <span style="color:#fdba74;">· Senin okulun</span>' : '') +
            (staff.length ? '<br><span style="color:#9a3412;font-size:12px;">' + staff.join(' · ') + '</span>' : '') + '</span>' +
            '<span style="display:flex;gap:6px;">' +
                '<button onclick="editSchoolStaff(\'' + s.id + '\')" class="btn-pastel-gray">İdare</button>' +
                (mine ? '' : '<button onclick="deleteSchoolRecord(\'' + s.id + '\')" class="btn-pastel-red">Sil</button>') +
            '</span>' +
        '</div>';
    }).join('') || '<p style="color:#94a3b8;">Henüz okul yok.</p>';
    var list = portalCatalog.teachers.map(function(t) {
        var school = portalCatalog.schools.find(function(s) { return s.id === t.school_id; });
        var mine = currentTeacher && t.id === currentTeacher.id;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">' +
            '<span>' + t.full_name + ' · ' + (canonicalSubject(t.subject) || 'Ders yok') + ' · ' + (school ? school.name : 'Okul yok') + '</span>' +
            (mine ? '<span style="color:#fdba74;">Sen</span>' : '<button onclick="deleteTeacherRecord(\'' + t.id + '\')" class="btn-pastel-red">Sil</button>') +
        '</div>';
    }).join('') || '<p style="color:#94a3b8;">Henüz öğretmen yok.</p>';
    var html = '<h3 style="margin:0 0 10px;font-size:15px;">Eğitim yılı</h3>' +
        '<p style="font-size:12px;color:#94a3b8;margin:0 0 8px;">Bu yıl bütün okullara ve öğretmen belgelerine yazılır.</p>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">' +
            '<input id="global-school-year" class="auth-input" value="' + portalYear + '" placeholder="2027-2028" style="margin:0;">' +
            '<button onclick="updateSchoolYear()" class="auth-btn" style="width:auto;padding:8px 12px;white-space:nowrap;">Yılı Kaydet</button>' +
        '</div>' +
        '<h3 style="margin:0 0 10px;font-size:15px;">Okullar</h3>' + schoolList +
        '<h3 style="margin:18px 0 10px;font-size:15px;">Öğretmenler</h3>' + list +
        '<h3 style="margin:18px 0 10px;font-size:15px;">Yeni okul</h3>' +
        '<input id="new-school-name" class="auth-input" placeholder="Okul adı">' +
        '<input id="new-school-principal" class="auth-input" placeholder="Müdür ad soyad">' +
        '<div id="new-deputy-list"><input class="auth-input deputy-name" placeholder="Müdür yardımcısı ad soyad"></div>' +
        '<button type="button" onclick="addDeputyField(\'new-deputy-list\')" class="auth-btn" style="background:#9a3412;margin-bottom:8px;">+ Müdür yardımcısı</button>' +
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

function addDeputyField(boxId) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var input = document.createElement('input');
    input.className = 'auth-input deputy-name';
    input.placeholder = 'Müdür yardımcısı ad soyad';
    box.appendChild(input);
}

function readDeputyNames(boxId) {
    var box = document.getElementById(boxId);
    if (!box) return '';
    return Array.prototype.map.call(box.querySelectorAll('.deputy-name'), function(el) {
        return el.value.trim();
    }).filter(Boolean).join('\n');
}

function staffColumnHint(error) {
    if (!error) return '';
    if (error.code === '42703' || /principal|deputies/i.test(error.message || '')) {
        return 'Supabase SQL editöründe bir kez çalıştır:\n\nalter table schools add column if not exists principal text default \'\';\nalter table schools add column if not exists deputies text default \'\';';
    }
    return error.message || 'Kayıt hatası';
}

function editSchoolStaff(id) {
    var school = (portalCatalog.schools || []).find(function(s) { return s.id === id; });
    if (!school) return;
    var deps = String(school.deputies || '').split('\n').map(function(name) { return name.trim(); }).filter(Boolean);
    if (!deps.length) deps = [''];
    var fields = deps.map(function(name) {
        return '<input class="auth-input deputy-name" value="' + String(name).replace(/"/g, '') + '" placeholder="Müdür yardımcısı ad soyad">';
    }).join('');
    openModal(school.name,
        '<input id="staff-principal" class="auth-input" value="' + String(school.principal || '').replace(/"/g, '') + '" placeholder="Müdür ad soyad">' +
        '<div id="staff-deputies">' + fields + '</div>' +
        '<button type="button" onclick="addDeputyField(\'staff-deputies\')" class="auth-btn" style="background:#9a3412;margin-bottom:8px;">+ Müdür yardımcısı</button>',
    function() { saveSchoolStaff(id); });
}

async function saveSchoolStaff(id) {
    var principal = document.getElementById('staff-principal').value.trim();
    var deputies = readDeputyNames('staff-deputies');
    var res = await supabaseClient.from('schools').update({ principal: principal, deputies: deputies }).eq('id', id);
    if (res.error) return alert(staffColumnHint(res.error));
    closeModal();
    await loadPortalCatalog();
    openSchoolTeacherAdmin();
}

async function saveNewSchool() {
    var name = document.getElementById('new-school-name').value.trim();
    if (!name) return alert('Okul adı gir.');
    var year = currentPortalYear();
    var principal = document.getElementById('new-school-principal').value.trim();
    var deputies = readDeputyNames('new-deputy-list');
    var res = await supabaseClient.from('schools').insert([{ name: name, academic_year: year, principal: principal, deputies: deputies }]);
    if (res.error) return alert(staffColumnHint(res.error));
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

async function updateSchoolYear() {
    if (!currentTeacher || !currentTeacher.is_admin) return;
    var input = document.getElementById('global-school-year');
    var year = input ? input.value.trim() : '';
    if (!year) return alert('Eğitim yılını yaz. Örnek: 2027-2028');
    var schools = portalCatalog.schools || [];
    if (!schools.length) return alert('Önce bir okul kaydet.');
    for (var i = 0; i < schools.length; i++) {
        var res = await supabaseClient.from('schools').update({ academic_year: year }).eq('id', schools[i].id);
        if (res.error) return alert(res.error.message);
    }
    currentTeacher.academic_year = year;
    localStorage.setItem('fen_academic_year', year);
    await loadPortalCatalog();
    alert('Eğitim yılı bütün okullara kaydedildi. Öğretmenler ve notlar duruyor.');
    openSchoolTeacherAdmin();
}

async function deleteRowsIn(table, column, ids) {
    if (!ids.length) return null;
    var res = await supabaseClient.from(table).delete().in(column, ids);
    return res.error ? res.error.message : null;
}

async function wipeTeacherData(teacherId) {
    var students = await supabaseClient.from('students').select('id').eq('teacher_id', teacherId);
    if (students.error) return students.error.message;
    var contents = await supabaseClient.from('lesson_contents').select('id').eq('teacher_id', teacherId);
    if (contents.error) return contents.error.message;
    var studentIds = (students.data || []).map(function(r) { return r.id; });
    var contentIds = (contents.data || []).map(function(r) { return r.id; });
    var err = await deleteRowsIn('quiz_results', 'student_id', studentIds);
    if (err) return err;
    err = await deleteRowsIn('student_progress', 'student_id', studentIds);
    if (err) return err;
    err = await deleteRowsIn('quiz_results', 'content_id', contentIds);
    if (err) return err;
    err = await deleteRowsIn('student_progress', 'content_id', contentIds);
    if (err) return err;
    var tables = ['lesson_contents', 'activities', 'report_templates', 'units_sections', 'students', 'branches'];
    for (var i = 0; i < tables.length; i++) {
        var res = await supabaseClient.from(tables[i]).delete().eq('teacher_id', teacherId);
        if (res.error) return res.error.message;
    }
    return null;
}

async function wipeSchoolData(schoolId) {
    var tables = ['lesson_contents', 'activities', 'report_templates', 'units_sections', 'students', 'branches'];
    for (var i = 0; i < tables.length; i++) {
        var res = await supabaseClient.from(tables[i]).delete().eq('school_id', schoolId);
        if (res.error && res.error.code !== '42703') return res.error.message;
    }
    return null;
}

async function deleteTeacherRecord(id) {
    if (!currentTeacher || !currentTeacher.is_admin) return;
    if (id === currentTeacher.id) return alert('Kendi hesabını silemezsin.');
    var row = portalCatalog.teachers.find(function(t) { return t.id === id; });
    if (!confirm('Öğretmen, şubeleri, öğrencileri, dersleri, quiz ve etkinlik verileri kalıcı silinsin mi?')) return;
    var wiped = await wipeTeacherData(id);
    if (wiped) return alert(wiped);
    var res = await supabaseClient.from('teachers').delete().eq('id', id);
    if (res.error) return alert(res.error.message);
    if (row && row.email) {
        var authRes = await deleteAuthAccount(row.email);
        if (authRes && authRes.error) return alert('Veriler silindi. Giriş hesabı silinemedi: ' + authRes.error.message);
    }
    await loadPortalCatalog();
    openSchoolTeacherAdmin();
}

async function deleteSchoolRecord(id) {
    if (!currentTeacher || !currentTeacher.is_admin) return;
    if (id === currentTeacher.school_id) return alert('Kendi okulunu silemezsin.');
    var people = portalCatalog.teachers.filter(function(t) { return t.school_id === id; });
    if (!confirm('Okul, öğretmenleri ve o okuldaki tüm şube, öğrenci, ders, quiz ve etkinlik verileri kalıcı silinsin mi?')) return;
    for (var i = 0; i < people.length; i++) {
        if (people[i].id === currentTeacher.id) continue;
        var wiped = await wipeTeacherData(people[i].id);
        if (wiped) return alert(wiped);
        var delT = await supabaseClient.from('teachers').delete().eq('id', people[i].id);
        if (delT.error) return alert(delT.error.message);
        if (people[i].email) await deleteAuthAccount(people[i].email);
    }
    var left = await wipeSchoolData(id);
    if (left) return alert(left);
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
        case 'evrak':
            if (typeof openEvrakScreen === 'function') openEvrakScreen(state.screen || 'home', state.grade || '');
            else renderTeacherPanelView(false);
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
        if (typeof officeCloudPull === 'function') {
            try { await officeCloudPull(); } catch (e) {}
        }
        var cleaned = await dedupeTransferredRows();
        renderTeacherPanelView(true);
        if (cleaned) alert(cleaned + ' tekrarlayan içerik silindi. Video ve deney birer tane kaldı.');
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
        academicYear: school ? (school.academic_year || DEFAULT_YEAR) : DEFAULT_YEAR
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
    var academicYear = localStorage.getItem('fen_academic_year') || DEFAULT_YEAR;

    openModal('Öğretmen Bilgileri',
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Okul Adı</label>' +
            '<input type="text" id="school-name" class="auth-input" value="' + schoolName + '" placeholder="Örn: Atatürk Ortaokulu">' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
            '<label style="display:block;margin-bottom:4px;font-size:13px;color:#94a3b8;">Eğitim-Öğretim Yılı</label>' +
            '<input type="text" id="academic-year" class="auth-input" value="' + academicYear + '" placeholder="Örn: 2027-2028">' +
        '</div>' +
        '<p style="font-size:12px;color:#64748b;">Bu bilgiler PDF ve Word belgelerinde resmi başlık olarak kullanılacak.</p>',
    async function() {
        var name = document.getElementById('school-name').value.trim();
        var year = document.getElementById('academic-year').value.trim();
        if (name) localStorage.setItem('fen_school_name', name);
        if (year) localStorage.setItem('fen_academic_year', year);
        if (supabaseClient && currentTeacher && currentTeacher.school_id && name) {
            var res = await supabaseClient.from('schools').update({ name: name }).eq('id', currentTeacher.school_id);
            if (res.error) return alert(res.error.message);
            currentTeacher.school_name = name;
        }
        if (supabaseClient && year) {
            var schools = portalCatalog.schools || [];
            for (var i = 0; i < schools.length; i++) {
                var yearRes = await supabaseClient.from('schools').update({ academic_year: year }).eq('id', schools[i].id);
                if (yearRes.error) return alert(yearRes.error.message);
            }
            currentTeacher.academic_year = year;
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
        '<div style="font-size:14px;font-weight:700;margin-top:4px;">' + getSubjectLine(grade) + '</div>' +
        '<div style="font-size:16px;font-weight:800;margin-top:6px;">' + title + '</div>' +
        '<div style="font-size:12px;margin-top:4px;">' + (student.name || '') + ' · No ' + (student.no || '') + ' · ' + grade + '. Sınıf / ' + short + '</div>' +
    '</div>';
}
function getSchoolHeader() {
    var schoolName = (currentTeacher && currentTeacher.school_name) || (studentScope && studentScope.schoolName) || localStorage.getItem('fen_school_name') || 'OKUL ADI';
    var academicYear = (currentTeacher && currentTeacher.academic_year) || (studentScope && studentScope.academicYear) || localStorage.getItem('fen_academic_year') || DEFAULT_YEAR;
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
    if (push !== false) saveState({ type: 'grade-mgmt', grade: grade });
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
    '</div>' +
    '<div class="grade-card" onclick="openEvrakScreen(\'kazanim\',\'' + grade + '\')" style="border-top-color:#0ea5e9;">' +
        '<h3>Kazanım</h3>' +
        '<p>Bu haftanın çıktıları</p>' +
        '<span class="card-action">Gir</span>' +
    '</div>';

    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + grade + '. Sınıflar</h1></div>' +
            '<div>' +
                '<button onclick="history.back()" class="logout-btn" style="background:#f97316; margin-right:6px;">Geri</button>' +
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
        if (await branchTaken(grade, full)) return alert('Bu şube bu derste başka öğretmende.');
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

function lessonArg(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function lessonHtml(value) {
    return String(value || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function renderExistingLessons(grade) {
    var container = document.getElementById('existing-lessons-list');
    if (!container) return;
    var units = (fenData[grade] && fenData[grade].units) || [];
    var pick = window._lessonPick && window._lessonPick.grade === String(grade) ? window._lessonPick : { grade: String(grade), unit: '', section: '' };
    window._lessonPick = pick;
    var unitOpts = '<option value="">Ünite seç</option>' + units.map(function(unit) {
        return '<option value="' + lessonHtml(unit.name) + '"' + (unit.name === pick.unit ? ' selected' : '') + '>' + lessonHtml(unit.name) + '</option>';
    }).join('');
    var unitObj = units.filter(function(unit) { return unit.name === pick.unit; })[0];
    var sections = (unitObj && unitObj.sections) || [];
    var sectionOpts = '<option value="">Bölüm seç</option>' + sections.map(function(section) {
        return '<option value="' + lessonHtml(section) + '"' + (section === pick.section ? ' selected' : '') + '>' + lessonHtml(section) + '</option>';
    }).join('');
    var lessons = ((fenData[grade] && fenData[grade].lessons) || []).filter(function(lesson) {
        return lesson.unit === pick.unit && lesson.section === pick.section;
    });
    var names = { video: 'Video', pptx: 'Slayt', experiment: 'Deney', quiz: 'Quiz', pdf: 'PDF' };
    var rows = lessons.map(function(lesson) {
        var lock = lesson.locked ? ' <span style="color:#b91c1c;font-size:12px;">Kilitli</span>' : '';
        return '<tr><td>' + lessonHtml(names[lesson.type] || lesson.type) + '</td><td>' + lessonHtml(lesson.title || '') + lock + '</td><td>' +
            '<button class="auth-btn doc-mini" onclick="openTeacherContent(\'' + lessonArg(grade) + '\',\'' + lessonArg(lesson.id) + '\')">Aç</button>' +
            '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteLessonContent(\'' + lessonArg(lesson.id) + '\',\'' + lessonArg(grade) + '\')">Sil</button>' +
            '</td></tr>';
    }).join('');
    var table = !pick.unit || !pick.section
        ? '<p style="color:#fff;">Ünite ve bölüm seç.</p>'
        : (rows
            ? '<div style="overflow-x:auto;background:#fff7ed;border-radius:12px;"><table class="data-table doc-table"><thead><tr><th>Tür</th><th>Başlık</th><th>İşlem</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
            : '<p style="color:#fff;">Bu bölümde içerik yok.</p>');
    container.innerHTML =
        '<select id="exist-unit" class="auth-input" onchange="pickExistingLesson(\'' + lessonArg(grade) + '\')">' + unitOpts + '</select>' +
        '<select id="exist-section" class="auth-input" onchange="pickExistingLesson(\'' + lessonArg(grade) + '\')">' + sectionOpts + '</select>' +
        table;
}
function pickExistingLesson(grade) {
    var unitEl = document.getElementById('exist-unit');
    var sectionEl = document.getElementById('exist-section');
    var prev = window._lessonPick || {};
    var unit = unitEl ? unitEl.value : '';
    var section = prev.unit === unit && sectionEl ? sectionEl.value : '';
    window._lessonPick = { grade: String(grade), unit: unit, section: section };
    renderExistingLessons(grade);
}
function openTeacherContent(grade, id) {
    var lesson = ((fenData[grade] && fenData[grade].lessons) || []).filter(function(item) { return String(item.id) === String(id); })[0];
    if (!lesson) return alert('İçerik bulunamadı.');
    if (lesson.type === 'quiz') {
        window._teacherQuizPreview = { grade: String(grade) };
        startStudentQuiz(lesson.id);
        return;
    }
    var panel = document.getElementById('grade-detail-panel');
    var body = '<p style="color:#fff;">İçerik açılamadı.</p>';
    if (lesson.type === 'pptx' && lesson.file_url) {
        body = '<iframe src="https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(lesson.file_url) + '" style="position:fixed;top:58px;left:0;width:100%;height:calc(100vh - 58px);border:none;background:#111;z-index:40;" allowfullscreen></iframe>';
    } else if (lesson.type === 'pdf' && lesson.file_url) {
        body = '<iframe src="' + lesson.file_url + '#toolbar=1" style="position:fixed;top:58px;left:0;width:100%;height:calc(100vh - 58px);border:none;background:#111;z-index:40;" allowfullscreen></iframe>';
    } else if (lesson.type === 'video' && lesson.file_url) {
        var yt = String(lesson.file_url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        var src = yt ? ('https://www.youtube.com/embed/' + yt[1] + '?rel=0') : lesson.file_url;
        body = '<iframe src="' + src + '" style="position:fixed;top:58px;left:0;width:100%;height:calc(100vh - 58px);border:none;background:#000;z-index:40;" allowfullscreen></iframe>';
    } else if (lesson.type === 'experiment' && lesson.experiment_url) {
        body = '<iframe class="experiment-frame" src="' + lesson.experiment_url + '" style="position:fixed;top:58px;left:0;width:100%;height:calc(100vh - 58px);border:none;background:#fff;z-index:40;" allowfullscreen></iframe>';
    }
    panel.innerHTML =
        '<header class="teacher-header">' +
            '<div class="header-brand"><h1>' + lessonHtml(lesson.title || 'İçerik') + '</h1></div>' +
            '<div><button onclick="openLessonOperations(\'' + lessonArg(grade) + '\', false)" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
            '<button onclick="logout()" class="logout-btn">Çıkış</button></div>' +
        '</header>' +
        '<section class="dashboard-content" style="padding:0;">' + body + '</section>';
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
            '<div class="header-brand"><h1>' + student.name + ' · ' + canonicalSubject(activeSubject()) + '</h1></div>' +
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
    var names = BADGE_TITLES[canonicalSubject(activeSubject())] || BADGE_TITLES['Fen Bilimleri'];
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

    var chain = ['video', 'pptx', 'experiment', 'quiz'];
    var chainAt = chain.indexOf(type);
    if (chainAt > 0) {
        var prevType = chain[chainAt - 1];
        var prevItems = (fenData[grade]?.lessons || []).filter(function(l) {
            return l.unit === unitName && l.section === sectionName && l.type === prevType && !l.locked;
        });
        var prevLeft = prevItems.some(function(l) { return completedIds.indexOf(l.id) < 0; });
        if (prevItems.length && prevLeft) {
            var names = { video: 'videoyu', pptx: 'slaytı', experiment: 'deneyi', quiz: 'quizi' };
            panel.innerHTML =
                '<header class="teacher-header"><div class="header-brand"><h1>Kilitli</h1></div>' +
                '<div><button onclick="openStudentSection(\'' + grade + '\',\'' + branch + '\',\'' + unitName.replace(/'/g,"\\'") + '\',\'' + sectionName.replace(/'/g,"\\'") + '\')" class="logout-btn" style="background:#f97316;">Geri</button></div></header>' +
                '<section class="dashboard-content"><p style="color:#fff;">Önce ' + (names[prevType] || 'önceki içeriği') + ' bitir.</p></section>';
            return;
        }
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

function quizHost() {
    if (window._teacherQuizPreview) return document.getElementById('grade-detail-panel');
    return document.getElementById('student-panel');
}
async function startStudentQuiz(contentId) {
    var preview = window._teacherQuizPreview;
    var grade = preview ? preview.grade : currentStudentContext.grade;
    var student = preview ? null : currentStudentContext.student;
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
    var panel = quizHost();
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
    var panel = quizHost();
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
    if (window._teacherQuizPreview) {
        var grade = window._teacherQuizPreview.grade;
        window._teacherQuizPreview = null;
        openLessonOperations(grade, false);
        return;
    }
    var ctx = currentStudentContext;
    openStudentLessons(ctx.grade, ctx.branch);
}

async function submitQuiz() {
    if (!currentQuizState) return;
    var student = currentStudentContext && currentStudentContext.student;
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

    if (window._teacherQuizPreview) {
        showQuizResults(currentQuizState, correct, total, score);
        return;
    }

    if (supabaseClient && student && student.id) {
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
    var panel = quizHost();
    var preview = window._teacherQuizPreview;
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
            '<button onclick="' + (preview ? 'cancelQuiz()' : 'openStudentLessons(currentStudentContext.grade, currentStudentContext.branch)') + '" class="logout-btn" style="background:#f97316;">Geri</button>' +
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
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine(grade) + '</p><h3>' + grade + '. Sinif (' + branchName + ') - Quiz</h3></div>' +
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

function quizShareText(grade, unit, section) {
    var subject = getSubjectLine(grade);
    var unitLine = String(unit || '').trim();
    var unitLow = unitLine.toLocaleLowerCase('tr-TR');
    if (unitLow.endsWith('ünitesi')) unitLine = unitLine;
    else if (unitLow.endsWith('ünite')) unitLine += 'Sİ';
    else unitLine += ' ÜNİTESİ';
    var sectionLine = String(section || '').trim();
    if (!/bölüm/i.test(sectionLine.toLocaleLowerCase('tr-TR'))) sectionLine += ' BÖLÜMÜ';
    return 'MERHABALAR;\n' +
        subject + '\n' +
        unitLine + '\n' +
        sectionLine + ' QUİZİ YAPILMIŞTIR.\n' +
        'SONUÇLARA AŞAĞIDA LİNKTEN BİLGİLERİ DOLDURARAK GİRİŞ YAPIP;\n' +
        'Quiz Sonuçları KARTINDAN ULAŞABİLİRSİNİZ\n\n' +
        'https://fenomenaltr.com/#giris';
}
function copyQuizShare() {
    var el = document.getElementById('quiz-share-text');
    if (!el) return;
    var text = el.value;
    var done = function() {
        var btn = document.getElementById('quiz-share-copy');
        if (btn) btn.textContent = 'Kopyalandı';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
            el.focus();
            el.select();
            document.execCommand('copy');
            done();
        });
        return;
    }
    el.focus();
    el.select();
    document.execCommand('copy');
    done();
}
function openQuizShare(grade, unit, section) {
    var text = quizShareText(grade, unit, section)
        .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
    openModal('Veli mesajı',
        '<p style="font-size:13px;color:#94a3b8;margin:0 0 8px;">Notlar kaydedildi. Mesajı kopyalayıp gruba gönderebilirsin.</p>' +
        '<textarea id="quiz-share-text" readonly style="width:100%;min-height:240px;padding:12px;border:1px solid #fdba74;border-radius:8px;font:14px/1.45 Calibri,sans-serif;color:#1c1917;resize:vertical;">' + text + '</textarea>' +
        '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button id="quiz-share-copy" type="button" class="auth-btn doc-mini" onclick="copyQuizShare()">Kopyala</button>' +
            '<button type="button" class="auth-btn doc-mini" style="background:#78716c;" onclick="closeModal()">Kapat</button>' +
        '</div>');
}

async function saveQuiz(grade, branchName) {
    var unit = document.getElementById('quiz-unit-sel').value;
    var section = document.getElementById('quiz-section-sel').value;
    var key = unit + '_' + section;
    var students = fenData[grade].branches[branchName];
    var hadScore = students.some(function(s) {
        var prev = s.quiz && s.quiz[key];
        return prev != null && String(prev).trim() !== '';
    });
    var entered = false;
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
        if (val !== '') entered = true;
        students[i].quiz[key] = val;
        if (supabaseClient) {
            await supabaseClient.from('students').update({ quiz: students[i].quiz })
                .eq('grade', grade).eq('branch', branchName).eq('school_no', students[i].no);
        }
    }
    await loadAllDataFromSupabase();
    if (!hadScore && entered) openQuizShare(grade, unit, section);
    else alert('Quiz notlari kaydedildi!');
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
                '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine(grade) + '</p></div>' +
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
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine(grade) + '</p><h3>Tum Olcekler</h3></div><div class="print-info"><p><b>Sube:</b> ' + grade + '. Sinif - ' + branchName + '</p><p><b>Unite:</b> ' + unit + '</p><p><b>Bolum:</b> ' + section + '</p><p><b>Etkinlik:</b> ' + base + '</p></div>' +
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
            '<div class="print-header"><h2>' + getSchoolHeader() + '</h2><p style="font-size:13px;margin:4px 0;font-weight:bold;">' + getSubjectLine(grade) + '</p><h3>Analiz Raporu</h3></div>' +
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
            if (typeof officeCloudPull === 'function') {
                try { await officeCloudPull(); } catch (e) {}
            }
            var cleaned = await dedupeTransferredRows();
            restoreStateFromSession();
            if (cleaned) alert(cleaned + ' tekrarlayan içerik silindi. Video ve deney birer tane kaldı.');
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


// ===== EVRAK (office.js) =====
// Evrak kartları. Eski öğrenci, quiz, ölçek ve rapor akışına dokunmaz.
function officeKey() {
    return 'fen_office_' + (typeof ownerId === 'function' ? (ownerId() || 'local') : 'local');
}
function officeBag() {
    try { return JSON.parse(localStorage.getItem(officeKey()) || '{}'); }
    catch (e) { return {}; }
}
function officeTeacherId() {
    if (typeof ownerId === 'function') {
        var id = ownerId();
        if (id && id !== 'local') return id;
    }
    return (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.id) || '';
}
function officeWrite(bag) {
    try { bag._cloudAt = Date.now(); } catch (e) {}
    localStorage.setItem(officeKey(), JSON.stringify(bag));
    officeCloudPushBag();
}
var _officePushTimer = null;
function officeCloudPushBag() {
    if (_officePushTimer) clearTimeout(_officePushTimer);
    _officePushTimer = setTimeout(function() { officeCloudPushBagNow(); }, 400);
}
function officeCloudWarn(message) {
    if (window._officeSchemaWarned) return;
    window._officeSchemaWarned = true;
    alert(message);
}
function officeCloudPushBagNow() {
    var tid = officeTeacherId();
    if (!tid || typeof supabaseClient === 'undefined' || !supabaseClient) return Promise.resolve();
    var bag = officeBag();
    var schoolId = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_id) || null;
    return supabaseClient.from('office_store').upsert({
        teacher_id: tid,
        school_id: schoolId,
        bag: bag,
        updated_at: new Date().toISOString()
    }, { onConflict: 'teacher_id' }).then(function(res) {
        if (res.error) officeCloudWarn('Evrak kaydı buluta yazılamadı. Supabase SQL editöründe schema_office.sql dosyasını bir kez çalıştır.\n' + res.error.message);
    }).catch(function(err) {
        officeCloudWarn('Evrak kaydı buluta yazılamadı. schema_office.sql çalıştırıldı mı?\n' + (err && err.message ? err.message : ''));
    });
}
function officeCloudPull() {
    var tid = officeTeacherId();
    if (!tid || typeof supabaseClient === 'undefined' || !supabaseClient) return Promise.resolve();
    if (window._officePulling) return window._officePulling;
    window._officePulling = supabaseClient.from('office_store').select('bag,updated_at').eq('teacher_id', tid).then(function(res) {
        if (res.error) {
            if (/office_store|schema cache|does not exist|relation/i.test(res.error.message || '')) {
                officeCloudWarn('Evrak tablosu yok. Supabase SQL editöründe schema_office.sql dosyasını bir kez çalıştır.');
            }
            return false;
        }
        var local = officeBag();
        var localAt = local._cloudAt || 0;
        var row = (res.data || [])[0];
        var remote = row && row.bag;
        var remoteAt = remote && remote._cloudAt ? remote._cloudAt : (row && row.updated_at ? new Date(row.updated_at).getTime() : 0);
        var localHas = Object.keys(local).some(function(k) { return k !== '_cloudAt'; });
        var remoteHas = !!(remote && Object.keys(remote).some(function(k) { return k !== '_cloudAt'; }));
        if (remoteHas && remoteAt >= localAt) {
            localStorage.setItem(officeKey(), JSON.stringify(remote));
            return false;
        }
        if (localHas) return officeCloudPushBagNow().then(function() { return true; });
        return true;
    }).then(function(pushFiles) {
        if (pushFiles) return officeCloudPushLocalFiles();
    }).catch(function() {});
    return window._officePulling;
}
function officePath(key) {
    return officeTeacherId() + '/' + encodeURIComponent(String(key));
}
function officeAsBlob(value) {
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer) return new Blob([value]);
    if (ArrayBuffer.isView(value)) return new Blob([value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)]);
    return new Blob([value]);
}
function officeRemotePut(key, value) {
    var tid = officeTeacherId();
    if (!tid || typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.storage) return Promise.resolve();
    return supabaseClient.storage.from('office-files').upload(officePath(key), officeAsBlob(value), {
        upsert: true,
        contentType: 'application/octet-stream'
    }).then(function(res) {
        if (res.error) {
            officeCloudWarn('Evrak dosyası buluta yazılamadı. schema_office.sql çalıştırıldı mı?\n' + res.error.message);
            return false;
        }
        return true;
    }).catch(function(err) {
        officeCloudWarn('Evrak dosyası buluta yazılamadı.\n' + (err && err.message ? err.message : ''));
        return false;
    });
}
function officeRemoteGet(key) {
    var tid = officeTeacherId();
    if (!tid || typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.storage) return Promise.resolve(null);
    return supabaseClient.storage.from('office-files').download(officePath(key)).then(function(res) {
        if (res.error || !res.data) return null;
        return res.data.arrayBuffer();
    }).catch(function() { return null; });
}
function officeRemoteDel(key) {
    var tid = officeTeacherId();
    if (!tid || typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.storage) return Promise.resolve();
    return supabaseClient.storage.from('office-files').remove([officePath(key)]).catch(function() {});
}
function officeCloudPushLocalFiles() {
    var tid = officeTeacherId();
    var mark = 'fen_office_pushed_' + tid;
    try { if (localStorage.getItem(mark) === '1') return Promise.resolve(); } catch (e) {}
    return officeDb().then(function(db) {
        return new Promise(function(resolve) {
            var tx = db.transaction('files', 'readonly');
            var req = tx.objectStore('files').getAllKeys();
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror = function() { resolve([]); };
        });
    }).then(function(keys) {
        var chain = Promise.resolve();
        var failed = false;
        keys.forEach(function(key) {
            chain = chain.then(function() {
                return officeIdbGet(key).then(function(buf) {
                    if (!buf) return;
                    return officeRemotePut(key, buf).then(function(ok) {
                        if (ok === false) failed = true;
                    });
                });
            }).catch(function() { failed = true; });
        });
        return chain.then(function() {
            if (!failed) {
                try { localStorage.setItem(mark, '1'); } catch (e) {}
            }
        });
    }).catch(function() {});
}
function officeEsc(value) {
    return String(value || '').replace(/[&<>"]/g, function(ch) {
        return { '&': '&', '<': '<', '>': '>', '"': '"' }[ch];
    });
}
function officeBack() {
    var panel = document.getElementById('grade-detail-panel');
    if (panel) panel.style.display = 'none';
    if (typeof renderTeacherPanelView === 'function') renderTeacherPanelView(false);
}
function officeShell(title, inner, backCall, screenId) {
    if (screenId && typeof saveState === 'function') saveState({ type: 'evrak', screen: screenId });
    var panel = document.getElementById('grade-detail-panel');
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    panel.style.display = 'flex';
    var back = screenId ? 'history.back()' : (backCall || 'officeBack()');
    panel.innerHTML =
        '<header class="teacher-header"><div class="header-brand"><h1>' + officeEsc(title) + '</h1></div>' +
        '<div><button onclick="' + back + '" class="logout-btn" style="background:#f97316;margin-right:6px;">Geri</button>' +
        '<button onclick="logout()" class="logout-btn">Çıkış</button></div></header>' +
        '<section class="dashboard-content" style="max-width:980px;">' + inner + '</section>';
}
function officeStaff() {
    var schoolId = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_id) || '';
    var school = ((typeof portalCatalog !== 'undefined' && portalCatalog.schools) || []).find(function(s) { return String(s.id) === String(schoolId); });
    var deputies = String((school && school.deputies) || '').split('\n').map(function(name) { return name.trim(); }).filter(Boolean);
    return { principal: (school && school.principal) || '', deputies: deputies };
}
function officeDoc(title, body) {
    var head = typeof getSchoolHeader === 'function' ? getSchoolHeader() : '';
    var lesson = typeof getSubjectLine === 'function' ? getSubjectLine('') : '';
    var teacher = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.full_name) || '';
    var staff = officeStaff();
    var deputyCells = staff.deputies.length ? staff.deputies.map(function(name) {
        return '<td style="border:none;text-align:center;">Müdür Yardımcısı<br><br>' + officeEsc(name) + '</td>';
    }).join('') : '<td style="border:none;text-align:center;">Müdür Yardımcısı<br><br>................</td>';
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
        '<style>body{font-family:Calibri,Arial;font-size:12pt;color:#111;}h1,h2{text-align:center;margin:4px 0;}table{width:100%;border-collapse:collapse;margin-top:12px;}td,th{border:1px solid #333;padding:6px;vertical-align:top;}th{background:#ffedd5;}</style></head><body>' +
        '<h1>' + head + '</h1><h2>' + officeEsc(lesson) + '</h2><h2>' + officeEsc(title) + '</h2>' + body +
        '<table style="margin-top:28px;border:none;"><tr>' +
        '<td style="border:none;text-align:center;">Öğretmen<br><br>' + officeEsc(teacher) + '</td>' +
        deputyCells +
        '<td style="border:none;text-align:center;">Okul Müdürü<br><br>' + officeEsc(staff.principal || '................') + '</td></tr></table></body></html>';
    var blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title.replace(/[^\wçğıöşüÇĞİÖŞÜ\- ]+/g, '') + '.doc';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
}
function officeCards(items) {
    return '<div class="grade-cards-grid">' + items.map(function(item) {
        return '<div class="grade-card" onclick="' + item.click + '" style="border-top-color:#f97316;"><h3>' + officeEsc(item.title) + '</h3><p>' + officeEsc(item.text || '') + '</p><span class="card-action">Gir</span></div>';
    }).join('') + '</div>';
}
function officeStudents(grade, branch) {
    var bag = (typeof fenData !== 'undefined' && fenData[grade] && fenData[grade].branches) || {};
    var key = branch;
    if (!bag[key]) {
        Object.keys(bag).some(function(name) {
            var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
            if (short === branch || name === grade + '/' + branch) { key = name; return true; }
            return false;
        });
    }
    return (bag[key] || []).slice().sort(function(a, b) { return parseInt(a.no, 10) - parseInt(b.no, 10); });
}
function officeWeeks(grade) {
    return (officeBag().plans && officeBag().plans[grade]) || [];
}

function openEvrakScreen(screen, grade) {
    screen = screen || 'home';
    if (screen === 'home') {
        officeShell('Evrak', officeCards([
            { title: 'Yıllık Plan', text: 'Çerçeve ve oluşturma', click: "openEvrakScreen('plan')" },
            { title: 'Zümre', text: 'Üç toplantı', click: "openEvrakScreen('zumre')" },
            { title: 'ŞÖK', text: 'Şube kurulu', click: "openEvrakScreen('sok')" },
            { title: 'Sınıf Rehberlik', text: 'Plan ve nöbet', click: "openEvrakScreen('rehber')" },
            { title: 'Kulüpler', text: 'Yönetmelik ve rapor', click: "openEvrakScreen('kulup')" },
            { title: 'Proje Ölçeği', text: 'Excel ölçek', click: "openEvrakScreen('proje')" },
            { title: 'Günlük Plan', text: 'Haftalık plan', click: "openEvrakScreen('gunluk')" },
            { title: 'İdari İşlemler', text: 'Dönem listesi', click: "openEvrakScreen('idari')" },
            { title: 'BEP', text: 'Öğrenci raporu', click: "openEvrakScreen('bep')" },
            { title: 'Öğretmen Dosyası', text: 'Yükle ve bölümler', click: "openEvrakScreen('dosya')" }
        ]), '', 'home');
        return;
    }
    if (screen === 'plan') return openYearlyPlan();
    if (screen === 'year-upload') return renderYearUpload();
    if (screen === 'year-build') return openYearBuild();
    if (screen === 'year-saved') return openYearSaved();
    if (screen === 'zumre') return openZumre();
    if (screen === 'zumre-upload') return renderZumreUpload();
    if (screen === 'zumre-build') return openZumreBuild();
    if (screen === 'zumre-saved') return openZumreSaved();
    if (screen === 'sok') return openSok();
    if (screen === 'sok-upload') return renderSokUpload();
    if (screen === 'sok-build') return openSokBuild();
    if (screen === 'sok-saved') return openSokSaved();
    if (screen === 'rehber') return openRehber();
    if (screen === 'rehber-yillik') return openRehberYear();
    if (screen === 'rehber-yillik-up') return openRehberPlanUpload();
    if (screen === 'rehber-yillik-build') return openRehberYearBuild();
    if (screen === 'rehber-yillik-saved') return openRehberSaved('yillik');
    if (screen === 'rehber-month') return openRehberMonthHome();
    if (screen === 'rehber-month-up') return openRehberMonthUpload();
    if (screen === 'rehber-month-build') return openRehberMonthBuild();
    if (screen === 'rehber-month-saved') return openRehberSaved('aylik');
    if (screen === 'rehber-seat') return openRehberSeat();
    if (screen === 'rehber-vote') return openRehberVote();
    if (screen === 'rehber-duty') return openRehberDuty();
    if (screen === 'kulup') return openKulup();
    if (screen === 'kulup-up') return openKulupUpload();
    if (screen === 'kulup-build') return openKulupBuild();
    if (screen === 'kulup-saved') return openKulupSaved();
    if (screen === 'proje') return openProjeHome();
    if (screen === 'proje-up') return openProjeUpload();
    if (screen === 'proje-eokul') return openProjeEokul();
    if (screen.indexOf('proje-eokul:') === 0) return openProjeEokul(screen.split(':')[1]);
    if (screen === 'proje-build') return openProjeBuild();
    if (screen === 'proje-saved') return openProjeSaved();
    if (screen.indexOf('proje-sheet:') === 0) return openProjeSheet(screen.split(':')[1]);
    if (screen === 'gunluk') return openGunlukHome();
    if (screen === 'gunluk-up') return openGunlukUpload();
    if (screen === 'gunluk-build') return openGunlukBuild();
    if (screen === 'gunluk-saved') return openGunlukSaved();
    if (screen === 'idari') return openIdari();
    if (screen.indexOf('idari-term:') === 0) return openIdariTerm(screen.split(':')[1]);
    if (screen === 'bep') return openBep();
    if (screen === 'bep-up') return openBepUpload();
    if (screen === 'bep-build') return openBepBuild();
    if (screen === 'bep-saved') return openBepSaved();
    if (screen === 'dosya') return openDosya();
    if (screen === 'dosya-up') return openDosyaUpload();
    if (screen.indexOf('dosya-sec:') === 0) return openDosyaSection(screen.split(':')[1]);
    if (screen === 'rehber-gor') return openHomeroom();
    if (screen.indexOf('kazanim:') === 0) {
        var gainBits = screen.split(':');
        return openWeekGains(gainBits[1] || grade || '5', gainBits[2] || '');
    }
    if (screen === 'kazanim') return openWeekGains(grade || '5', '');
}

function openYearlyPlan() {
    officeShell('Yıllık Plan', officeCards([
        { title: 'Çerçeve Yükle', text: 'Excel', click: "openEvrakScreen('year-upload')" },
        { title: 'Plan Oluştur', text: 'Sınıf seç, indir', click: "openEvrakScreen('year-build')" },
        { title: 'Kayıtlı Planlar', text: 'Son indirilenler', click: "openEvrakScreen('year-saved')" }
    ]), '', 'plan');
}
function parsePlanSheet(name, rows) {
    var title = String((rows[0] && rows[0][0]) || '');
    var nameHit = String(name).match(/([3-8])(?!\d)/);
    var titleHit = title.match(/([3-8])\s*\.?\s*SINIF/i);
    var grade = nameHit ? nameHit[1] : (titleHit ? titleHit[1] : '');
    if (!grade) return null;
    var headerAt = -1;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
        var labels = (rows[i] || []).map(function(cell) { return String(cell || '').trim().toLocaleUpperCase('tr-TR'); });
        if (labels.indexOf('HAFTA') >= 0) { headerAt = i; break; }
    }
    if (headerAt < 0) return { grade: grade, weeks: [] };
    var headers = (rows[headerAt] || []).map(function(cell) { return String(cell || '').trim().toLocaleUpperCase('tr-TR'); });
    function col(pred) {
        for (var c = 0; c < headers.length; c++) if (pred(headers[c])) return c;
        return -1;
    }
    var cAy = col(function(h) { return h === 'AY'; });
    var cHafta = col(function(h) { return h === 'HAFTA'; });
    var cSaat = col(function(h) { return h.indexOf('DERS') >= 0; });
    var cUnite = col(function(h) { return h.indexOf('ÜNİTE') >= 0 || h.indexOf('UNITE') >= 0; });
    var cKonu = col(function(h) { return h.indexOf('KONU') >= 0; });
    var cKaz = col(function(h) {
        if (h.indexOf('AÇIK') >= 0 || h.indexOf('ACIK') >= 0 || h.indexOf('SÜREÇ') >= 0 || h.indexOf('SUREC') >= 0) return false;
        return h.indexOf('ÖĞRENME ÇIK') >= 0 || h.indexOf('OGRENME CIK') >= 0 || h === 'KAZANIM';
    });
    var cSurec = col(function(h) { return h.indexOf('AÇIK') >= 0 || h.indexOf('ACIK') >= 0 || h.indexOf('SÜREÇ') >= 0 || h.indexOf('SUREC') >= 0; });
    var cGun = col(function(h) { return h.indexOf('BELİRLİ') >= 0 || h.indexOf('BELIRLI') >= 0; });
    var weeks = [];
    var month = '';
    for (var r = headerAt + 1; r < rows.length; r++) {
        var row = rows[r] || [];
        function cell(index) { return index < 0 ? '' : String(row[index] || '').replace(/\s+/g, ' ').trim(); }
        var hafta = cell(cHafta);
        var hit = hafta.match(/(\d{1,2})\s*\.?\s*Hafta/i);
        if (!hit) {
            var line = row.map(function(value) { return String(value || '').trim(); }).filter(Boolean).join(' ');
            if (/TATİL|BAYRAM/i.test(line) && line.length < 180) {
                weeks.push({ no: '', label: line.slice(0, 160), ay: '', saat: '', unite: '', konu: '', kazanim: '', surec: '', gun: '', text: line.slice(0, 160), holiday: true });
            }
            continue;
        }
        var ay = cell(cAy);
        if (ay) month = ay;
        var item = {
            no: String(parseInt(hit[1], 10)),
            label: hafta.slice(0, 80),
            ay: month,
            saat: cell(cSaat).slice(0, 24),
            unite: cell(cUnite).slice(0, 400),
            konu: cell(cKonu).slice(0, 400),
            kazanim: cell(cKaz).slice(0, 900),
            surec: (cSurec < 0 ? '' : String(row[cSurec] || '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()).slice(0, 1200),
            gun: cell(cGun).slice(0, 220),
            holiday: false
        };
        item.text = [item.label, item.unite, item.konu, item.kazanim].filter(Boolean).join(' | ').slice(0, 700);
        weeks.push(item);
    }
    return { grade: grade, weeks: weeks };
}
function renderYearUpload() {
    var bag = officeBag();
    var list = '<p style="color:#fff;margin-top:18px;">Henüz çerçeve yok.</p>';
    if (bag.workbook) {
        var info = bag.framework || {};
        list = '<div class="grade-cards-grid" style="margin-top:18px;"><div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteYearFramework()">Sil</button><h3>Yüklü çerçeve</h3><p>' + officeEsc(info.name || 'Excel') + '</p><p>' + officeEsc(info.when || '') + '</p></div></div>';
    }
    officeShell('Çerçeve Yükle',
        '<p style="color:#fff;margin-bottom:10px;">Exceldeki her sayfa kendi sınıfına yazılır. 5. sayfa 5. sınıf, 3. sayfa 3. sınıf olur. Sınıf seçmene gerek yok.</p>' +
        '<input id="year-file" type="file" accept=".xlsx,.xls" class="auth-input">' +
        '<button class="auth-btn" onclick="saveYearFile()">Kaydet</button>' + list,
        '', 'year-upload');
}
function openYearUpload() { openEvrakScreen('year-upload'); }
function deleteYearFramework() {
    if (!confirm('Yüklü çerçeve silinsin mi?')) return;
    var bag = officeBag();
    delete bag.workbook;
    delete bag.framework;
    bag.plans = {};
    officeWrite(bag);
    window._skipHistory = true;
    renderYearUpload();
    window._skipHistory = false;
}
function bytesToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunks = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(chunks.join(''));
}
function xmlEsc(value) {
    return String(value || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function retitlePlan(text, grade, school, year) {
    if (!/YILLIK PLAN/i.test(text)) return text;
    if (!new RegExp(grade + '\\s*\\.\\s*SINIF', 'i').test(text)) return text;
    var next = year ? text.replace(/20\d{2}\s*[-–]\s*20\d{2}/, year) : text;
    if (school && next.toLocaleUpperCase('tr-TR').indexOf(school.toLocaleUpperCase('tr-TR')) < 0) {
        next = next.replace(/(?:İLKOKUL|ORTAOKUL)?\s*(\d)\s*\.\s*SINIF/i, function(match, num) {
            return num === String(grade) ? school + ' ' + num + '.SINIF' : match;
        });
    }
    next = next.replace(/\s*TASLAK\s+ÇERÇEVE\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
    return next;
}
function downloadPlanExcel(grade, principal, date) {
    var bag = officeBag();
    if (!bag.workbook) return alert('Çerçeve Excelini yeniden yükle.');
    if (!window.fflate) return alert('Sayfayı yenile. Tablo motoru yüklenmedi.');
    var files = fflate.unzipSync(base64ToBytes(bag.workbook));
    function decode(bytes) { return new TextDecoder().decode(bytes); }
    var school = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_name) || '';
    var year = typeof currentPortalYear === 'function' ? currentPortalYear() : '';
    var staff = officeStaff();
    var teacher = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.full_name) || '';
    var wbXml = decode(files['xl/workbook.xml']);
    var rels = decode(files['xl/_rels/workbook.xml.rels']);
    var tags = wbXml.match(/<sheet\b[^>]*\/>/g) || [];
    var index = -1;
    var rid = '';
    tags.forEach(function(tag, i) {
        var name = (tag.match(/name="([^"]+)"/) || [])[1] || '';
        var hit = name.match(/([3-8])(?!\d)/);
        if (hit && hit[1] === String(grade)) { index = i; rid = (tag.match(/r:id="([^"]+)"/) || [])[1] || ''; }
    });
    if (index < 0) return alert(grade + '. sınıf sayfası dosyada yok.');
    var target = (rels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || [])[1] || '';
    var sheetPath = 'xl/' + target.replace(/^\/+/, '').replace(/^\.\.\//, '');
    if (!files[sheetPath]) return alert('Sayfa bulunamadı.');
    var strings = decode(files['xl/sharedStrings.xml']);
    strings = strings.replace(/<t([^>]*)>([^<]*)<\/t>/g, function(all, attrs, text) {
        var next = retitlePlan(text, grade, school, year);
        return next === text ? all : '<t' + attrs + '>' + xmlEsc(next) + '</t>';
    });
    var sheet = decode(files[sheetPath]);
    var last = 0;
    (sheet.match(/<row r="(\d+)"/g) || []).forEach(function(row) {
        var n = parseInt(row.replace(/\D/g, ''), 10);
        if (n > last) last = n;
    });
    var lastCol = ((sheet.match(/<dimension ref="[A-Z]+\d+:([A-Z]+)\d+"/) || [])[1]) || 'N';
    var styles = decode(files['xl/styles.xml']);
    var styleCount = parseInt((styles.match(/<cellXfs count="(\d+)"/) || [])[1] || '0', 10);
    var leftStyle = styleCount;
    var centerStyle = styleCount + 1;
    styles = styles.replace(/<cellXfs count="\d+"/, '<cellXfs count="' + (styleCount + 2) + '"');
    styles = styles.replace('</cellXfs>',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>');
    var subject = '';
    if (typeof canonicalSubject === 'function' && typeof currentTeacher !== 'undefined' && currentTeacher) subject = canonicalSubject(currentTeacher.subject || '');
    else if (typeof currentTeacher !== 'undefined' && currentTeacher) subject = currentTeacher.subject || '';
    var dateText = String(date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, function(_, y, m, d) { return d + '/ ' + m + ' / ' + y; });
    var start = last + 2;
    var blocks = [
        { text: (subject || 'DERS').toLocaleUpperCase('tr-TR') + ' ÖĞRETMENLERİ', style: centerStyle },
        { text: '', style: leftStyle },
        { text: 'Ad Soyad: ' + teacher, style: leftStyle },
        { text: 'İmza: ........................................................', style: leftStyle },
        { text: '', style: centerStyle },
        { text: 'UYGUNDUR', style: centerStyle },
        { text: dateText, style: centerStyle },
        { text: principal || staff.principal || '', style: centerStyle },
        { text: 'Okul Müdürü', style: centerStyle }
    ];
    var extra = blocks.map(function(block, i) {
        var r = start + i;
        return '<row r="' + r + '" ht="22" customHeight="1"><c r="A' + r + '" t="inlineStr" s="' + block.style + '"><is><t xml:space="preserve">' + xmlEsc(block.text) + '</t></is></c></row>';
    }).join('');
    var merges = blocks.map(function(_, i) { return 'A' + (start + i) + ':' + lastCol + (start + i); });
    sheet = sheet.replace('</sheetData>', extra + '</sheetData>');
    sheet = sheet.replace(/<dimension ref="([A-Z]+\d+:[A-Z]+)(\d+)"/, function(all, head) {
        return '<dimension ref="' + head + (start + blocks.length - 1) + '"';
    });
    if (sheet.indexOf('<mergeCells') >= 0) {
        sheet = sheet.replace(/<mergeCells count="(\d+)">/, function(_, n) {
            return '<mergeCells count="' + (parseInt(n, 10) + merges.length) + '">';
        });
        sheet = sheet.replace('</mergeCells>', merges.map(function(ref) { return '<mergeCell ref="' + ref + '"/>'; }).join('') + '</mergeCells>');
    }
    var keepTag = tags[index] || '';
    wbXml = wbXml.replace(/<sheets>[\s\S]*?<\/sheets>/, '<sheets>' + keepTag + '</sheets>');
    wbXml = wbXml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, function(block) {
        var names = block.match(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/g) || [];
        var kept = names.filter(function(tag) {
            return (tag.match(/localSheetId="(\d+)"/) || [])[1] === String(index);
        }).map(function(tag) { return tag.replace(/localSheetId="\d+"/, 'localSheetId="0"'); });
        return kept.length ? '<definedNames>' + kept.join('') + '</definedNames>' : '';
    });
    if (/activeTab="/.test(wbXml)) wbXml = wbXml.replace(/activeTab="\d+"/, 'activeTab="0"');
    else wbXml = wbXml.replace('<workbookView ', '<workbookView activeTab="0" ');
    files['xl/sharedStrings.xml'] = new TextEncoder().encode(strings);
    files['xl/styles.xml'] = new TextEncoder().encode(styles);
    files[sheetPath] = new TextEncoder().encode(sheet);
    files['xl/workbook.xml'] = new TextEncoder().encode(wbXml);
    var zipped = fflate.zipSync(files);
    var blob = new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = grade + '. Sınıf Yıllık Plan.xlsx';
    link.click();
    setTimeout(function() { URL.revokeObjectURL(link.href); }, 1500);
}
function saveYearFile() {
    var file = document.getElementById('year-file').files[0];
    if (!file || !window.XLSX) return alert('Excel seç.');
    var reader = new FileReader();
    reader.onload = function(e) {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var bag = officeBag();
        bag.plans = {};
        bag.savedGrades = [];
        var report = [];
        wb.SheetNames.forEach(function(name) {
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
            var parsed = parsePlanSheet(name, rows);
            if (!parsed) return;
            bag.plans[parsed.grade] = parsed.weeks;
            var count = parsed.weeks.filter(function(w) { return !w.holiday; }).length;
            report.push(parsed.grade + '. sınıf: ' + count + ' hafta (' + name + ')');
        });
        if (!report.length) return alert('Sayfalarda sınıf bulunamadı. Sayfa adı 5, 6 gibi sınıf numarası içermeli.');
        try {
            bag.workbook = bytesToBase64(e.target.result);
            bag.framework = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
        } catch (err) {
            return alert('Dosya tarayıcıya sığmadı. Daha küçük bir excel dene.');
        }
        alert('Her sayfa kendi sınıfına yazıldı. Tablo bozulmadan Excel inecek.\n' + report.join('\n'));
        window._skipHistory = true;
        renderYearUpload();
        window._skipHistory = false;
    };
    reader.readAsArrayBuffer(file);
}
function openYearBuild() {
    var grades = ['3', '4', '5', '6', '7', '8'].map(function(g) {
        var count = officeWeeks(g).filter(function(w) { return !w.holiday; }).length;
        return '<option value="' + g + '">' + g + '. Sınıf (' + count + ' hafta)</option>';
    }).join('');
    var staff = officeStaff();
    officeShell('Plan Oluştur',
        '<p style="color:#fff;margin-bottom:8px;">Tablo, renk ve logo aynı kalır. Sadece başlıktaki okul ve yıl değişir. Müdür ile tarih tablonun altına yazılır.</p>' +
        '<select id="build-grade" class="auth-input">' + grades + '</select>' +
        '<input id="build-principal" class="auth-input" placeholder="Müdür adı soyadı" value="' + officeEsc(staff.principal) + '">' +
        '<input id="build-date" type="date" class="auth-input">' +
        '<button class="auth-btn" onclick="downloadYearPlan()">Excel indir</button>',
        '', 'year-build');
}
function downloadYearPlan() {
    var grade = document.getElementById('build-grade').value;
    if (!officeWeeks(grade).length) return alert('Bu sınıfta hafta yok. Çerçeveyi yeniden yükle.');
    var bag = officeBag();
    bag.savedGrades = bag.savedGrades || [];
    if (bag.savedGrades.indexOf(String(grade)) < 0) bag.savedGrades.push(String(grade));
    officeWrite(bag);
    downloadPlanExcel(grade, document.getElementById('build-principal').value.trim(), document.getElementById('build-date').value);
}
function openYearSaved() {
    var rows = (officeBag().savedGrades || []).slice().sort().map(function(g) {
        var weeks = officeWeeks(g).filter(function(w) { return !w.holiday; });
        if (!weeks.length) return null;
        return {
            item: { source: 'year', id: g, name: g + '. sınıf yıllık plan', when: weeks.length + ' hafta' },
            extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteYearPlan(\'' + g + '\')">Sil</button>'
        };
    }).filter(Boolean);
    officeShell('Kayıtlı planlar', rows.length ? officeDocTable(rows, true) : '<p style="color:#fff;">Henüz oluşturulmuş plan yok. Plan oluşturdan sınıf seçip indir.</p>', '', 'year-saved');
}
function deleteYearPlan(grade) {
    if (!confirm(grade + '. sınıf planı silinsin mi?')) return;
    var bag = officeBag();
    bag.savedGrades = (bag.savedGrades || []).filter(function(g) { return String(g) !== String(grade); });
    officeWrite(bag);
    window._skipHistory = true;
    openYearSaved();
    window._skipHistory = false;
}
function downloadSavedPlan(grade) {
    var staff = officeStaff();
    downloadPlanExcel(grade, staff.principal, '');
}

function openZumre() {
    officeShell('Zümre', officeCards([
        { title: 'Zümre Ekle', text: 'Taslak yükle', click: "openEvrakScreen('zumre-upload')" },
        { title: 'Zümre Oluştur', text: 'Tarih ve yer', click: "openEvrakScreen('zumre-build')" },
        { title: 'Kayıtlı Zümreler', text: 'Word indir', click: "openEvrakScreen('zumre-saved')" }
    ]), '', 'zumre');
}
function zumreKinds() {
    return [
        { id: 'sene', label: 'Sene başı' },
        { id: 'donem2', label: '2. Dönem başı' },
        { id: 'yil', label: 'Yıl sonu' }
    ];
}
function zumreKindOptions() {
    return zumreKinds().map(function(kind) { return '<option value="' + kind.id + '">' + kind.label + '</option>'; }).join('');
}
function officeDb() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open('fen-office', 1);
        req.onupgradeneeded = function() {
            if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files');
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}
function officeIdbGet(key) {
    return officeDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction('files', 'readonly');
            var req = tx.objectStore('files').get(key);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { reject(req.error); };
        });
    });
}
function officeIdbPut(key, value) {
    return officeDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').put(value, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };
        });
    });
}
function officeIdbDel(key) {
    return officeDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').delete(key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };
        });
    });
}
function officeFilePut(key, value) {
    return officeIdbPut(key, value).then(function() { return officeRemotePut(key, value); });
}
function officeFileGet(key) {
    return officeIdbGet(key).then(function(local) {
        if (local) return local;
        return officeRemoteGet(key).then(function(remote) {
            if (!remote) return null;
            return officeIdbPut(key, remote).then(function() { return remote; });
        });
    });
}
function officeFileDel(key) {
    return officeIdbDel(key).then(function() { return officeRemoteDel(key); });
}
function renderZumreUpload() {
    var skip = window._skipHistory;
    var meta = officeBag().zumreTpl || {};
    Promise.all(zumreKinds().map(function(kind) {
        return officeFileGet('zumre-tpl-' + kind.id).then(function(buf) {
            if (!buf) return '';
            var info = meta[kind.id] || {};
            return '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteZumreTemplate(\'' + kind.id + '\')">Sil</button><h3>' + officeEsc(kind.label) + '</h3><p>' + officeEsc(info.name || 'Word taslağı') + '</p><p>' + officeEsc(info.when || '') + '</p></div>';
        });
    })).then(function(cards) {
        var list = cards.filter(Boolean).join('');
        var prev = window._skipHistory;
        window._skipHistory = skip || prev;
        officeShell('Zümre Ekle',
            '<p style="color:#fff;margin-bottom:8px;">Zümre tipini seç. Word taslağını yükle. Yazılar ve tablolar aynı kalır.</p>' +
            '<select id="zumre-up-kind" class="auth-input">' + zumreKindOptions() + '</select>' +
            '<input id="zumre-up-file" type="file" accept=".docx" class="auth-input">' +
            '<button class="auth-btn" onclick="saveZumreTemplate()">Kaydet</button>' +
            (list ? '<div class="grade-cards-grid" style="margin-top:18px;">' + list + '</div>' : '<p style="color:#fff;margin-top:18px;">Henüz taslak yok.</p>'),
            '', 'zumre-upload');
        window._skipHistory = prev;
    }).catch(function() { alert('Taslaklar okunamadı.'); });
}
function openZumreUpload() { openEvrakScreen('zumre-upload'); }
function deleteZumreTemplate(kind) {
    if (!confirm('Bu zümre taslağı silinsin mi?')) return;
    var bag = officeBag();
    if (bag.zumreTpl) delete bag.zumreTpl[kind];
    officeWrite(bag);
    officeFileDel('zumre-tpl-' + kind).then(function() {
        window._skipHistory = true;
        renderZumreUpload();
        window._skipHistory = false;
    });
}
function saveZumreTemplate() {
    var file = document.getElementById('zumre-up-file').files[0];
    var kind = document.getElementById('zumre-up-kind').value;
    if (!file) return alert('Word dosyası seç.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('zumre-tpl-' + kind, reader.result).then(function() {
            var bag = officeBag();
            bag.zumreTpl = bag.zumreTpl || {};
            bag.zumreTpl[kind] = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            alert('Taslak kaydedildi.');
            window._skipHistory = true;
            renderZumreUpload();
            window._skipHistory = false;
        }).catch(function() { alert('Taslak kaydedilemedi.'); });
    };
    reader.readAsArrayBuffer(file);
}
function openZumreBuild() {
    officeShell('Zümre Oluştur',
        '<p style="color:#fff;margin-bottom:8px;">Okul, yıl, müdür ve müdür yardımcısı kayıttan gelir. Tarih, saat, yer ve katılımcıları sen yaz.</p>' +
        '<select id="zumre-kind" class="auth-input">' + zumreKindOptions() + '</select>' +
        '<input id="zumre-date" type="date" class="auth-input">' +
        '<input id="zumre-time" type="time" class="auth-input">' +
        '<input id="zumre-place" class="auth-input" placeholder="Toplantı yeri">' +
        '<textarea id="zumre-people" class="auth-input" style="height:90px;" placeholder="Katılımcılar, her satıra bir ad soyad"></textarea>' +
        '<button class="auth-btn" onclick="buildZumre()">Oluştur ve Word indir</button>',
        '', 'zumre-build');
}
function zumreInfo(dateIso, place, time, people) {
    var staff = officeStaff();
    var school = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_name) || '';
    var year = typeof currentPortalYear === 'function' ? currentPortalYear() : '';
    var date = '';
    var hit = String(dateIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (hit) date = hit[3] + '/' + hit[2] + '/' + hit[1];
    return {
        school: school,
        year: year,
        principal: staff.principal || '',
        deputy: (staff.deputies || [])[0] || '',
        date: date,
        place: place || '',
        time: time || '',
        people: people || []
    };
}
function patchZumreXml(xml, info) {
    var nodes = [];
    var re = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
    var match;
    while ((match = re.exec(xml))) nodes.push({ start: match.index, len: match[0].length, attrs: match[1], text: match[2] });
    var texts = nodes.map(function(node) { return node.text; });
    var signColumns = [];
    function filled(from, step) {
        var i = from;
        while (i >= 0 && i < texts.length) {
            if (String(texts[i]).trim()) return i;
            i += step;
        }
        return -1;
    }
    var people = (info.people || []).map(function(name) { return String(name).trim(); }).filter(Boolean);
    function personName(name) {
        var words = String(name || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        if (words.length < 2 || words.length > 4) return '';
        if (words.some(function(word) { return word.length < 2 || !/^[A-ZÇĞİÖŞÜİa-zçğıöşü.]+$/.test(word); })) return '';
        var clean = words.join(' ');
        if (/MADDE|OKUL|MÜDÜR|ÖĞRETMEN|BAŞKAN|DERS|HAZİRAN|MAYIS|NİSAN|OCAK|ARALIK|KASIM|MART|EYLÜL|EKİM|ŞUBAT|TEMMUZ|AĞUSTOS|SINIF|ÜNİTE|YAZILI/.test(clean.toLocaleUpperCase('tr-TR'))) return '';
        return clean;
    }
    if (people.length) {
        var originals = [];
        function addOriginal(name) {
            var clean = personName(name);
            if (!clean) return;
            var key = clean.toLocaleUpperCase('tr-TR');
            if (!originals.some(function(item) { return item.toLocaleUpperCase('tr-TR') === key; })) originals.push(clean);
        }
        var listSpans = [];
        texts.forEach(function(text, index) {
            if (text.length > 160 || !/[-–]/.test(text)) return;
            var found = text.split(/\s*[-–]\s*/).map(personName).filter(Boolean);
            if (found.length < 2) return;
            found.forEach(addOriginal);
            var words = [];
            var end = index;
            for (var follow = index + 1; follow < texts.length && follow < index + 8; follow++) {
                var bit = texts[follow].trim();
                if (!bit) { if (texts[follow].length > 12) break; continue; }
                if (bit.length > 22 || !/^[A-ZÇĞİÖŞÜİa-zçğıöşü.\-–\s]+$/.test(bit)) break;
                end = follow;
                if (!/^[-–]+$/.test(bit)) words.push(bit);
            }
            words.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).reduce(function(pair, word) {
                if (!pair.length) return [word];
                addOriginal(pair[0] + ' ' + word);
                return [];
            }, []);
            listSpans.push({ index: index, end: end });
        });
        var blocked = {};
        listSpans.forEach(function(span) { for (var i = span.index; i <= span.end; i++) blocked[i] = true; });
        var chair = {};
        function knownPerson(text) {
            var key = String(text || '').trim().toLocaleUpperCase('tr-TR');
            return originals.some(function(name) { return name.toLocaleUpperCase('tr-TR') === key; });
        }
        texts.forEach(function(text, index) {
            if (!/zümre başkan/i.test(text)) return;
            var prev = filled(index - 1, -1);
            var next = filled(index + 1, 1);
            if (prev >= 0 && knownPerson(texts[prev])) chair[prev] = true;
            if (next >= 0 && knownPerson(texts[next])) chair[next] = true;
        });
        var sigFrom = -1;
        texts.forEach(function(text, index) {
            if (text.trim().toLocaleLowerCase('tr-TR') !== 'müdür yardımcısı') return;
            for (var back = index - 1; back >= Math.max(0, index - 12); back--) {
                if (/\s{8,}/.test(texts[back]) && texts[back].replace(/\s/g, '').length > 6) sigFrom = back;
            }
        });
        if (sigFrom >= 0) { for (var s = sigFrom; s < texts.length && s < sigFrom + 8; s++) blocked[s] = true; }
        var deputyAt = {};
        texts.forEach(function(text, index) {
            var prev = filled(index - 1, -1);
            var prev2 = prev >= 0 ? filled(prev - 1, -1) : -1;
            var title = ((prev2 >= 0 ? texts[prev2] : '') + ' ' + (prev >= 0 ? texts[prev] : '')).replace(/\s+/g, ' ');
            var name = String(text || '').trim();
            if (/müdür\s*yrd|müdür yardımc/i.test(title) && name.split(' ').length >= 2 && name.split(' ').length <= 4 && name.length < 40) {
                deputyAt[index] = true;
                blocked[index] = true;
            }
        });
        var slots = [];
        texts.forEach(function(text, index) {
            if (blocked[index] || chair[index]) return;
            var upper = text.toLocaleUpperCase('tr-TR');
            var cursor = 0;
            while (cursor < text.length) {
                var hit = '';
                originals.forEach(function(name) {
                    var key = name.toLocaleUpperCase('tr-TR');
                    if (upper.slice(cursor, cursor + key.length) === key && key.length > hit.length) hit = key;
                });
                if (hit) { slots.push({ index: index, start: cursor, end: cursor + hit.length }); cursor += hit.length; }
                else cursor++;
            }
        });
        var listText = people.join(' – ');
        listSpans.forEach(function(span) {
            texts[span.index] = listText;
            for (var i = span.index + 1; i <= span.end; i++) texts[i] = '';
        });
        var grouped = {};
        slots.forEach(function(slot, order) {
            slot.who = people[order % people.length];
            grouped[slot.index] = grouped[slot.index] || [];
            grouped[slot.index].push(slot);
        });
        Object.keys(grouped).forEach(function(key) {
            var index = Number(key);
            var next = texts[index];
            grouped[key].sort(function(a, b) { return b.start - a.start; }).forEach(function(slot) {
                next = next.slice(0, slot.start) + slot.who + next.slice(slot.end);
            });
            texts[index] = next;
        });
        Object.keys(chair).forEach(function(key) { texts[key] = people[0]; });
        Object.keys(deputyAt).forEach(function(key) {
            texts[key] = (String(texts[key]).match(/^\s*/) || [''])[0] + info.deputy;
        });
    }
    if (info.time) {
        var clock = String(info.time).split(':');
        var hour = String(parseInt(clock[0], 10));
        var minute = clock[1] || '00';
        for (var t = 0; t < texts.length; t++) {
            var around = texts.slice(Math.max(0, t - 3), t + 4).join(' ');
            if (!/saat|SAAT/.test(around)) continue;
            if (/^\d{1,2}$/.test(texts[t].trim()) && texts[t + 1] === ':' && /^\d{2}$/.test(String(texts[t + 2]).trim())) {
                texts[t] = hour;
                texts[t + 2] = minute;
                t += 2;
            } else if (/^\d{1,2}:\d{2}\s?$/.test(texts[t])) {
                texts[t] = texts[t].replace(/\d{1,2}:\d{2}/, hour + ':' + minute);
            }
        }
    }
    var school = String(info.school || '').trim();
    var core = school.replace(/\s+ortaokulu\s*$/i, '').trim();
    if (core) {
        texts.forEach(function(text, index) {
            var next = filled(index + 1, 1);
            if (next < 0 || !/^ORTAOKULU/i.test(String(texts[next]).trim())) return;
            if (!text.trim() || text.trim().length > 40 || /EĞİTİM|DERSİ|ZÜMRE|MÜDÜR/i.test(text)) return;
            texts[index] = (!/\s$/.test(text) && !/^\s/.test(String(texts[next]))) ? core + ' ' : core;
        });
    }
    var year = String(info.year || '');
    var yearMatch = year.match(/^(20\d{2})-(20\d{2})$/);
    if (yearMatch) {
        for (var i = 0; i < texts.length - 3; i++) {
            var joined = texts[i] + texts[i + 1] + texts[i + 2] + texts[i + 3];
            if (!/^20\d{2}-20\d{2}\s?$/.test(joined) || String(texts[i]).length !== 3) continue;
            var near = texts.slice(i, i + 8).join(' ');
            if (!/Eğitim|EĞİTİM/i.test(near)) continue;
            var tail = /\s$/.test(texts[i + 3]) ? ' ' : '';
            texts[i] = yearMatch[1].slice(0, 3);
            texts[i + 1] = yearMatch[1].slice(3);
            texts[i + 2] = '-' + yearMatch[2].slice(0, 3);
            texts[i + 3] = yearMatch[2].slice(3) + tail;
            i += 3;
        }
        texts.forEach(function(text, index) {
            if (!/^20\d{2}-20\d{2}\s?$/.test(text)) return;
            if (!/Eğitim|EĞİTİM/i.test(texts.slice(index, index + 8).join(' '))) return;
            texts[index] = year + (/\s$/.test(text) ? ' ' : '');
        });
    }
    if (info.principal) {
        texts.forEach(function(text, index) {
            if (String(text).trim() !== 'OKUL MÜDÜRÜ') return;
            var prev = filled(index - 1, -1);
            if (prev >= 0 && texts[prev].trim().length > 2 && texts[prev].trim().length < 40) texts[prev] = info.principal;
        });
    }
    if (info.deputy) {
        texts.forEach(function(text, index) {
            if (String(text).trim().toLocaleLowerCase('tr-TR') !== 'müdür yardımcısı') return;
            var best = -1;
            var bestGap = 0;
            for (var back = index - 1; back >= 0 && back >= index - 8; back--) {
                if (!/^\s*\S+(?:\s+\S+){0,2}\s{2,}\S/.test(texts[back])) continue;
                var gap = (String(texts[back]).match(/\s{2,}/) || [''])[0].length;
                if (gap > bestGap) { best = back; bestGap = gap; }
            }
            if (best >= 0) texts[best] = texts[best].replace(/^\s*\S+(?:\s+\S+){0,2}(?=\s{2,})/, info.deputy);
            var next = filled(index + 1, 1);
            if (text.length < 24 && next >= 0 && texts[next].trim().length < 32 && !/öğretmen|müdür|okul/i.test(texts[next])) texts[next] = info.deputy;
        });
    }
    if (info.date) {
        var parts = info.date.split('/');
        var day = parts[0];
        var month = parts[1];
        var fullYear = parts[2];
        function context(index) { return texts.slice(Math.max(0, index - 4), index + 8).join(' '); }
        var skip = 0;
        for (var n = 0; n < texts.length; n++) {
            if (n < skip) continue;
            var ctx = context(n);
            var dotted = /^(?:[…]|\.|\s|\/)+$/.test(String(texts[n]).trim());
            if (!/günü saat|TARİH|UYGUNDUR/i.test(ctx) && !dotted) continue;
            if (/[…]|\.{2,}/.test(texts[n]) && texts[n].length < 80 && /^\d{2}\s?$/.test(String(texts[n + 1]).trim()) && texts[n + 2] === '/' && /^\d{4}/.test(String(texts[n + 3]).trim())) {
                texts[n] = texts[n].replace(/(?:[…]|\.)+\/?\s*$/, day + '/' + month);
                texts[n + 1] = '';
                texts[n + 3] = fullYear + (/\s$/.test(texts[n + 3]) ? ' ' : '');
                skip = n + 4;
            } else if (/[…]|\.{2,}/.test(texts[n]) && texts[n].length < 40 && texts[n + 1] === '/' && /^\d{2}$/.test(String(texts[n + 2]).trim()) && texts[n + 3] === '/' && /^\d{4}/.test(String(texts[n + 4]).trim())) {
                texts[n] = texts[n].replace(/(?:[…]|\.)+$/, day);
                texts[n + 2] = month;
                texts[n + 4] = fullYear;
                skip = n + 5;
            } else if (/^\d$/.test(texts[n]) && /^\d{1,2}$/.test(String(texts[n + 1]).trim()) && texts[n + 2] === '/' && /^\d{2}$/.test(texts[n + 3]) && texts[n + 4] === '/' && /^\d{4}/.test(String(texts[n + 5]).trim())) {
                texts[n] = '';
                texts[n + 1] = day;
                texts[n + 3] = month;
                texts[n + 5] = fullYear + (/\s$/.test(texts[n + 5]) ? ' ' : '');
                skip = n + 6;
            } else if (/^\d{1,2}$/.test(texts[n].trim()) && /^\/\d{2}$/.test(texts[n + 1]) && texts[n + 2] === '/' && /^\d{4}/.test(String(texts[n + 3]).trim())) {
                texts[n] = day;
                texts[n + 1] = '/' + month;
                texts[n + 3] = fullYear + (/\s$/.test(texts[n + 3]) ? ' ' : '');
                skip = n + 4;
            } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(texts[n].trim())) {
                texts[n] = day + '/' + month + '/' + fullYear;
                skip = n + 1;
            } else if (/^\d$/.test(texts[n]) && /^\d$/.test(texts[n + 1]) && texts[n + 2] === '/' && /^\d{2}$/.test(texts[n + 3]) && texts[n + 4] === '/' && /^\d{3}$/.test(texts[n + 5]) && /^\d$/.test(texts[n + 6])) {
                texts[n] = day.slice(0, 1);
                texts[n + 1] = day.slice(1);
                texts[n + 3] = month;
                texts[n + 5] = fullYear.slice(0, 3);
                texts[n + 6] = fullYear.slice(3);
                skip = n + 7;
            } else if (/^\d{1,2}$/.test(texts[n].trim()) && texts[n + 1] === '/' && /^\d{2}$/.test(texts[n + 2]) && texts[n + 3] === '/' && /^\d{4}$/.test(texts[n + 4])) {
                texts[n] = day;
                texts[n + 2] = month;
                texts[n + 4] = fullYear;
                skip = n + 5;
            } else if (/^\d{1,2}$/.test(texts[n].trim()) && texts[n + 1] === '/' && /^\d{2}$/.test(texts[n + 2]) && texts[n + 3] === '/' && /^\d{3}$/.test(texts[n + 4]) && /^\d$/.test(texts[n + 5])) {
                texts[n] = day;
                texts[n + 2] = month;
                texts[n + 4] = fullYear.slice(0, 3);
                texts[n + 5] = fullYear.slice(3);
                skip = n + 6;
            } else if (/^\d{1,2}$/.test(texts[n].trim()) && /^\/\d{2}\/\d{3}$/.test(texts[n + 1]) && /^\d$/.test(String(texts[n + 2]).trim())) {
                texts[n] = String(parseInt(day, 10));
                texts[n + 1] = '/' + month + '/' + fullYear.slice(0, 3);
                texts[n + 2] = fullYear.slice(3);
                skip = n + 3;
            }
        }
    }
    if (info.place) {
        texts.forEach(function(text, index) {
            if (/^\s*\d+\s*\/\s*[A-Za-zÇĞİÖŞÜ]\s*sınıfında/i.test(text)) {
                if (/^\d+\s*\/\s*[A-Za-zÇĞİÖŞÜ]$/i.test(info.place)) texts[index] = ' ' + info.place.replace(/\s+/g, '') + ' sınıfında';
                else texts[index] = ' ' + info.place + text.replace(/^\s*\d+\s*\/\s*[A-Za-zÇĞİÖŞÜ]\s*sınıfında/i, '');
                return;
            }
            if (/^\s*\d+\s*\/\s*[A-Za-zÇĞİÖŞÜ]\s*$/i.test(text) && text.length < 14) {
                texts[index] = info.place;
                return;
            }
            if (/sınıfında/i.test(text) && text.length < 140) {
                var slash = filled(index - 1, -1);
                var num = slash >= 0 ? filled(slash - 1, -1) : -1;
                var classCode = /^\d+\s*\/\s*[A-Za-zÇĞİÖŞÜ]$/i.test(info.place);
                if (slash >= 0 && num >= 0 && /^\/?[A-Za-zÇĞİÖŞÜ]$/i.test(texts[slash].trim()) && /^\d+$/.test(texts[num].trim())) {
                    texts[num] = '';
                    texts[slash] = '';
                    if (classCode) texts[index] = ' ' + info.place.replace(/\s+/g, '') + text;
                    else texts[index] = ' ' + info.place + text.replace(/^\s*sınıfında/i, '');
                }
            }
            if (/\/[A-Za-z]\s*Sınıfı/i.test(text) && text.length < 30) {
                var prev = filled(index - 1, -1);
                if (prev >= 0 && /^\d+$/.test(texts[prev].trim())) texts[prev] = '';
                texts[index] = info.place;
            }
        });
    }
    if (people.length) {
        var role = 'Öğretmen';
        texts.forEach(function(text, index) {
            var bit = text.trim();
            var near = (texts[index] + ' ' + (texts[index + 1] || '') + ' ' + (texts[index + 2] || '')).toLocaleLowerCase('tr-TR');
            if (/fen bilimleri/.test(near) && /öğretmen/.test(near)) role = 'Fen Bilimleri Öğretmeni';
            else if (/öğretmeni$/i.test(bit) && bit.length < 40 && bit.length > role.length && role === 'Öğretmen') role = bit;
        });
        var seen = {};
        var columns = [];
        function addColumn(name, title) {
            var key = String(name || '').trim().toLocaleLowerCase('tr-TR');
            if (!key || seen[key]) return;
            seen[key] = 1;
            columns.push({ name: String(name).trim(), role: title });
        }
        if (info.deputy) addColumn(info.deputy, 'Müdür Yardımcısı');
        people.forEach(function(person) { addColumn(person, role); });
        signColumns = columns;
    }
    var out = xml;
    for (var k = nodes.length - 1; k >= 0; k--) {
        if (texts[k] === nodes[k].text) continue;
        out = out.slice(0, nodes[k].start) + '<w:t' + nodes[k].attrs + '>' + xmlEsc(texts[k]) + '</w:t>' + out.slice(nodes[k].start + nodes[k].len);
    }
    if (info.date) {
        out = out.replace(/(TOPLANTI TARİHİ<\/w:t>[\s\S]{0,300}?<\/w:tc>\s*<w:tc>[\s\S]{0,800}?<w:pPr>[\s\S]*?<\/w:pPr>)(\s*<\/w:p>)/, function(all, head, tail) {
            var cell = head.split(/<w:tc>/).pop();
            if (/<w:t[\s>]/.test(cell)) return all;
            return head + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>' + xmlEsc(info.date) + '</w:t></w:r>' + tail;
        });
    }
    if (signColumns.length) {
        var width = Math.max(1400, Math.floor(9360 / signColumns.length));
        function signCell(text, bold) {
            return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="0"/></w:pPr><w:r><w:rPr>' + (bold ? '<w:b/>' : '') + '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>' + xmlEsc(text) + '</w:t></w:r></w:p></w:tc>';
        }
        var table = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tr>' +
            signColumns.map(function(column) { return signCell(column.name, true); }).join('') + '</w:tr><w:tr>' +
            signColumns.map(function(column) { return signCell(column.role, false); }).join('') + '</w:tr></w:tbl>';
        out = out.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S]){0,4000}?\s{8,}(?:(?!<\/w:p>)[\s\S]){0,4000}?<\/w:p>\s*<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S]){0,4000}?Müdür Yardımcısı(?:(?!<\/w:p>)[\s\S]){0,4000}?<\/w:p>/, table);
    }
    return out;
}
function patchZumreBuffer(buffer, info) {
    var files = fflate.unzipSync(new Uint8Array(buffer));
    Object.keys(files).forEach(function(name) {
        if (!/word\/(document|header\d*|footer\d*)\.xml$/.test(name)) return;
        var xml = new TextDecoder().decode(files[name]);
        files[name] = new TextEncoder().encode(patchZumreXml(xml, info));
    });
    return fflate.zipSync(files);
}
function saveBlob(bytes, filename, type) {
    var blob = new Blob([bytes], { type: type });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(function() { URL.revokeObjectURL(link.href); }, 1500);
}
function buildZumre() {
    var kind = document.getElementById('zumre-kind').value;
    var date = document.getElementById('zumre-date').value;
    var place = document.getElementById('zumre-place').value.trim();
    var time = document.getElementById('zumre-time').value;
    var people = document.getElementById('zumre-people').value.split(/[\n,;]/).map(function(name) { return name.trim(); }).filter(Boolean);
    if (!people.length) return alert('Katılımcı yaz.');
    if (!window.fflate) return alert('Sayfayı yenile.');
    officeFileGet('zumre-tpl-' + kind).then(function(buffer) {
        if (!buffer) return alert('Önce bu tip için taslak yükle.');
        var info = zumreInfo(date, place, time, people);
        var bytes = patchZumreBuffer(buffer, info);
        var id = 'z' + Date.now();
        var label = (zumreKinds().filter(function(item) { return item.id === kind; })[0] || {}).label || kind;
        return officeFilePut('zumre-doc-' + id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then(function() {
            var bag = officeBag();
            bag.zumreSaved = bag.zumreSaved || [];
            bag.zumreSaved.unshift({ id: id, kind: kind, label: label, date: info.date, place: place, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            saveBlob(bytes, label + ' Zümre.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        });
    }).catch(function(err) { alert('Zümre oluşturulamadı. ' + (err && err.message ? err.message : '')); });
}
function openZumreSaved() {
    var rows = (officeBag().zumreSaved || []).map(function(item) {
        return {
            item: { source: 'zumre', id: item.id, name: item.label || 'Zümre', when: [item.date, item.place, item.when].filter(Boolean).join(' · ') },
            extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteZumreSaved(\'' + item.id + '\')">Sil</button>'
        };
    });
    officeShell('Kayıtlı zümreler', rows.length ? officeDocTable(rows, true) : '<p style="color:#fff;">Henüz oluşturulmuş zümre yok.</p>', '', 'zumre-saved');
}
function deleteZumreSaved(id) {
    if (!confirm('Bu zümre silinsin mi?')) return;
    var bag = officeBag();
    bag.zumreSaved = (bag.zumreSaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('zumre-doc-' + id).then(function() {
        window._skipHistory = true;
        openZumreSaved();
        window._skipHistory = false;
    });
}
function zumreParagraphs(buffer) {
    var files = fflate.unzipSync(new Uint8Array(buffer));
    var xml = new TextDecoder().decode(files['word/document.xml']);
    return xml.split(/<\/w:p>/).map(function(part) {
        return part.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ? part.match(/<w:t[^>]*>([^<]*)<\/w:t>/g).map(function(tag) { return tag.replace(/<[^>]+>/g, ''); }).join('') : '';
    }).map(function(line) { return line.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
}
function downloadSavedZumre(id, mode) {
    var item = (officeBag().zumreSaved || []).filter(function(row) { return row.id === id; })[0] || {};
    officeFileGet('zumre-doc-' + id).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        var name = (item.label || 'Zumre') + (item.date ? ' ' + item.date.replace(/\//g, '.') : '');
        if (mode === 'word') {
            saveBlob(new Uint8Array(buffer), name + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            return;
        }
        var file = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        var blob = new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        function mammothPdf() {
            if (!window.mammoth) return alert('PDF oluşturulamadı. Sayfayı yenile.');
            mammoth.convertToHtml({ arrayBuffer: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) }).then(function(result) {
                var pdf = new (getJsPDF())({ unit: 'mm', format: 'a4' });
                var host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:-14000px;top:0;width:720px;background:#fff;color:#111;font:12px Arial;line-height:1.35;';
                host.innerHTML = '<style>table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #222;padding:4px 6px;vertical-align:top}p{margin:0 0 6px}strong{font-weight:700}</style>';
                var source = document.createElement('div');
                source.innerHTML = result.value;
                host.appendChild(source);
                document.body.appendChild(host);
                var blocks = Array.prototype.slice.call(source.children);
                var sheets = [];
                var sheet = document.createElement('div');
                sheet.style.cssText = 'width:680px;padding:18px;background:#fff;';
                host.appendChild(sheet);
                blocks.forEach(function(node) {
                    sheet.appendChild(node);
                    if (sheet.scrollHeight > 980 && sheet.childNodes.length > 1) {
                        sheet.removeChild(node);
                        sheets.push(sheet);
                        sheet = document.createElement('div');
                        sheet.style.cssText = 'width:680px;padding:18px;background:#fff;';
                        host.appendChild(sheet);
                        sheet.appendChild(node);
                    }
                });
                if (sheet.childNodes.length) sheets.push(sheet);
                var pageNo = 0;
                function paint() {
                    if (pageNo >= sheets.length) { document.body.removeChild(host); pdf.save(name + '.pdf'); return; }
                    html2canvas(sheets[pageNo], { scale: 1.4, backgroundColor: '#ffffff', logging: false }).then(function(canvas) {
                        if (pageNo) pdf.addPage();
                        var pw = pdf.internal.pageSize.getWidth();
                        var ph = pdf.internal.pageSize.getHeight();
                        var width = pw - 10;
                        var height = Math.min(ph - 10, (canvas.height * width) / canvas.width);
                        pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 5, 5, width, height);
                        pageNo++;
                        paint();
                    }).catch(function() { document.body.removeChild(host); alert('PDF oluşturulamadı.'); });
                }
                paint();
            }).catch(function() { alert('PDF oluşturulamadı.'); });
        }
        if (!window.html2canvas || typeof getJsPDF !== 'function') return alert('PDF aracı yüklenmedi. Sayfayı yenile.');
        if (!window.docx) return mammothPdf();
        var host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;background:#fff;';
        document.body.appendChild(host);
        docx.renderAsync(blob, host, null, { breakPages: true, inWrapper: true }).then(function() {
            var pages = Array.prototype.slice.call(host.querySelectorAll('section'));
            if (!pages.length) { document.body.removeChild(host); return mammothPdf(); }
            var pdf = new (getJsPDF())({ unit: 'mm', format: 'a4' });
            var pageNo = 0;
            function paint() {
                if (pageNo >= pages.length) { document.body.removeChild(host); pdf.save(name + '.pdf'); return; }
                html2canvas(pages[pageNo], { scale: 1.3, backgroundColor: '#ffffff', logging: false }).then(function(canvas) {
                    if (pageNo) pdf.addPage();
                    var pw = pdf.internal.pageSize.getWidth();
                    var ph = pdf.internal.pageSize.getHeight();
                    var width = pw;
                    var height = (canvas.height * width) / canvas.width;
                    if (height > ph) { width = width * (ph / height); height = ph; }
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - width) / 2, 0, width, height);
                    pageNo++;
                    paint();
                }).catch(function() { document.body.removeChild(host); mammothPdf(); });
            }
            paint();
        }).catch(function() {
            if (host.parentNode) document.body.removeChild(host);
            mammothPdf();
        });
    });
}

function openSok() {
    officeShell('ŞÖK', officeCards([
        { title: 'ŞÖK Ekle', text: 'Taslak yükle', click: "openEvrakScreen('sok-upload')" },
        { title: 'ŞÖK Oluştur', text: 'Sınıf, öğrenci, öğretmen', click: "openEvrakScreen('sok-build')" },
        { title: 'Kayıtlı ŞÖK', text: 'Word indir', click: "openEvrakScreen('sok-saved')" }
    ]), '', 'sok');
}
function sokKinds() {
    return [
        { id: 'sene', label: 'Sene başı' },
        { id: 'sene8', label: '8. sınıf sene başı' },
        { id: 'donem2', label: '2. Dönem başı' },
        { id: 'yil', label: 'Yıl sonu' },
        { id: 'yil8', label: '8. sınıf yıl sonu' }
    ];
}
function sokKindOptions() {
    return sokKinds().map(function(kind) { return '<option value="' + kind.id + '">' + kind.label + '</option>'; }).join('');
}
function renderSokUpload() {
    var skip = window._skipHistory;
    var meta = officeBag().sokTpl || {};
    Promise.all(sokKinds().map(function(kind) {
        return officeFileGet('sok-tpl-' + kind.id).then(function(buf) {
            if (!buf) return '';
            var info = meta[kind.id] || {};
            return '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteSokTemplate(\'' + kind.id + '\')">Sil</button><h3>' + officeEsc(kind.label) + '</h3><p>' + officeEsc(info.name || 'Word taslağı') + '</p><p>' + officeEsc(info.when || '') + '</p></div>';
        });
    })).then(function(cards) {
        var list = cards.filter(Boolean).join('');
        var prev = window._skipHistory;
        window._skipHistory = skip || prev;
        officeShell('ŞÖK Ekle',
            '<p style="color:#fff;margin-bottom:8px;">ŞÖK tipini seç. Word taslağını yükle. Yazılar ve tablolar aynı kalır.</p>' +
            '<select id="sok-up-kind" class="auth-input">' + sokKindOptions() + '</select>' +
            '<input id="sok-up-file" type="file" accept=".docx" class="auth-input">' +
            '<button class="auth-btn" onclick="saveSokTemplate()">Kaydet</button>' +
            (list ? '<div class="grade-cards-grid" style="margin-top:18px;">' + list + '</div>' : '<p style="color:#fff;margin-top:18px;">Henüz taslak yok.</p>'),
            '', 'sok-upload');
        window._skipHistory = prev;
    }).catch(function() { alert('Taslaklar okunamadı.'); });
}
function saveSokTemplate() {
    var file = document.getElementById('sok-up-file').files[0];
    var kind = document.getElementById('sok-up-kind').value;
    if (!file) return alert('Word dosyası seç.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('sok-tpl-' + kind, reader.result).then(function() {
            var bag = officeBag();
            bag.sokTpl = bag.sokTpl || {};
            bag.sokTpl[kind] = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            alert('Taslak kaydedildi.');
            window._skipHistory = true;
            renderSokUpload();
            window._skipHistory = false;
        }).catch(function() { alert('Taslak kaydedilemedi.'); });
    };
    reader.readAsArrayBuffer(file);
}
function deleteSokTemplate(kind) {
    if (!confirm('Bu ŞÖK taslağı silinsin mi?')) return;
    var bag = officeBag();
    if (bag.sokTpl) delete bag.sokTpl[kind];
    officeWrite(bag);
    officeFileDel('sok-tpl-' + kind).then(function() {
        window._skipHistory = true;
        renderSokUpload();
        window._skipHistory = false;
    });
}
function sokPeopleSeed() {
    var staff = officeStaff();
    var teacher = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.full_name) || '';
    var subject = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.subject) || '';
    var lines = [];
    if (staff.deputies[0]) lines.push(staff.deputies[0] + ' - Okul Müdür Yardımcısı');
    if (teacher) lines.push(teacher + ' - Sınıf Öğretmeni / ' + subject);
    return lines.join('\n');
}
function sokSplitPerson(line) {
    var text = String(line || '').trim();
    if (!text) return { name: '', role: '' };
    var cut = text.indexOf(' - ');
    var size = 3;
    if (cut < 0) { cut = text.indexOf('|'); size = 1; }
    if (cut < 0) { cut = text.indexOf('-'); size = 1; }
    if (cut < 0 && text.indexOf('/') > 0 && text.slice(0, text.indexOf('/')).trim().split(/\s+/).length >= 2) {
        cut = text.indexOf('/');
        size = 1;
    }
    if (cut < 0) return { name: text, role: '' };
    return { name: text.slice(0, cut).trim(), role: text.slice(cut + size).trim() };
}
function openSokBuild() {
    var grades = ['5', '6', '7', '8'].map(function(g) { return '<option>' + g + '</option>'; }).join('');
    officeShell('ŞÖK Oluştur',
        '<p style="color:#fff;margin-bottom:8px;">Taslağı seç. Sınıf ve şubedeki öğrenciler tabloya yazılır. Öğretmenleri her satıra Ad Soyad - Branş yaz.</p>' +
        '<select id="sok-kind" class="auth-input">' + sokKindOptions() + '</select>' +
        '<select id="sok-grade" class="auth-input" onchange="fillSokBranches()">' + grades + '</select>' +
        '<select id="sok-branch" class="auth-input"></select>' +
        '<input id="sok-date" type="date" class="auth-input">' +
        '<input id="sok-time" type="time" class="auth-input">' +
        '<input id="sok-place" class="auth-input" placeholder="Toplantı yeri" value="Öğretmenler odası">' +
        '<textarea id="sok-people" class="auth-input" style="height:140px;" placeholder="Ad Soyad - Branş">' + officeEsc(sokPeopleSeed()) + '</textarea>' +
        '<button class="auth-btn" onclick="buildSok()">Oluştur ve Word indir</button>',
        '', 'sok-build');
    fillSokBranches();
}
function fillSokBranches() {
    var gradeEl = document.getElementById('sok-grade');
    var sel = document.getElementById('sok-branch');
    if (!gradeEl || !sel) return;
    var grade = gradeEl.value;
    var names = Object.keys((fenData[grade] && fenData[grade].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option value="A">A</option>';
}
function sokDirectCells(row) {
    var cells = [];
    for (var i = 0; i < row.childNodes.length; i++) if (row.childNodes[i].nodeName === 'w:tc') cells.push(row.childNodes[i]);
    return cells;
}
function sokRowText(row) {
    return Array.prototype.map.call(row.getElementsByTagName('w:t'), function(node) { return node.textContent || ''; }).join('');
}
function sokSetCell(cell, value) {
    var texts = cell.getElementsByTagName('w:t');
    if (texts.length) {
        texts[0].textContent = value;
        texts[0].setAttribute('xml:space', 'preserve');
        for (var i = 1; i < texts.length; i++) texts[i].textContent = '';
        return;
    }
    var para = cell.getElementsByTagName('w:p')[0];
    var sample = rowSampleRun(cell);
    if (!para || !sample) return;
    var run = sample.cloneNode(true);
    var runs = run.getElementsByTagName('w:t');
    if (!runs.length) return;
    runs[0].textContent = value;
    runs[0].setAttribute('xml:space', 'preserve');
    for (var j = 1; j < runs.length; j++) runs[j].textContent = '';
    para.appendChild(run);
}
function rowSampleRun(cell) {
    var row = cell.parentNode;
    var runs = row.getElementsByTagName('w:r');
    for (var i = 0; i < runs.length; i++) if (runs[i].getElementsByTagName('w:t').length) return runs[i];
    return null;
}
function sokTables(doc) {
    return Array.prototype.filter.call(doc.getElementsByTagName('w:tbl'), function(table) {
        return /Okul No/.test(sokRowText(table)) && /Adı Soyadı|Adi Soyadi/.test(sokRowText(table));
    });
}
function sokFillStudents(doc, students) {
    var tables = sokTables(doc);
    if (!tables.length || !students.length) return;
    var slots = [];
    tables.forEach(function(table) {
        var rows = Array.prototype.filter.call(table.childNodes, function(node) { return node.nodeName === 'w:tr'; });
        var headerAt = -1;
        rows.forEach(function(row, index) { if (headerAt < 0 && /Okul No/.test(sokRowText(row))) headerAt = index; });
        rows.forEach(function(row, index) {
            if (index > headerAt && sokDirectCells(row).length >= 8) slots.push({ table: table, row: row });
        });
    });
    if (!slots.length) return;
    var proto = slots[slots.length - 1].row;
    var lastTable = slots[slots.length - 1].table;
    while (slots.length < students.length) {
        var copy = proto.cloneNode(true);
        lastTable.appendChild(copy);
        slots.push({ table: lastTable, row: copy });
    }
    students.forEach(function(student, index) {
        var cells = sokDirectCells(slots[index].row);
        if (cells[0]) sokSetCell(cells[0], String(student.no || ''));
        if (cells[1]) sokSetCell(cells[1], student.name || '');
    });
    for (var extra = students.length; extra < slots.length; extra++) slots[extra].row.parentNode.removeChild(slots[extra].row);
    tables.forEach(function(table) {
        if (!table.parentNode) return;
        var left = Array.prototype.filter.call(table.childNodes, function(node) {
            return node.nodeName === 'w:tr' && sokDirectCells(node).length >= 8 && !/Okul No/.test(sokRowText(node));
        });
        if (!left.length) table.parentNode.removeChild(table);
    });
}
function sokFillPeople(doc, people) {
    if (!people.length) return;
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        var rows = Array.prototype.filter.call(table.childNodes, function(node) { return node.nodeName === 'w:tr'; });
        var header = null;
        rows.some(function(row) { if (/İMZA|IMZA/.test(sokRowText(row).toLocaleUpperCase('tr-TR')) && /GÖREV|GOREV|AD/i.test(sokRowText(row))) { header = row; return true; } return false; });
        if (!header) return;
        var headCells = sokDirectCells(header);
        var nameAt = 0;
        var roleAt = 1;
        headCells.forEach(function(cell, index) {
            var text = sokRowText(cell).toLocaleUpperCase('tr-TR');
            if (/AD/.test(text) && /SOY/.test(text)) nameAt = index;
            if (/GÖREV|GOREV|BRAN/.test(text)) roleAt = index;
        });
        var data = rows.filter(function(row) { return row !== header && sokDirectCells(row).length >= 2 && rows.indexOf(row) > rows.indexOf(header); });
        if (!data.length) return;
        var proto = data[data.length - 1];
        data.forEach(function(row) { row.parentNode.removeChild(row); });
        people.forEach(function(person) {
            var row = proto.cloneNode(true);
            var cells = sokDirectCells(row);
            if (cells[nameAt]) sokSetCell(cells[nameAt], person.name);
            if (cells[roleAt]) sokSetCell(cells[roleAt], person.role);
            cells.forEach(function(cell, index) { if (index !== nameAt && index !== roleAt) sokSetCell(cell, ''); });
            header.parentNode.appendChild(row);
        });
    });
}
function sokTexts(doc) {
    return Array.prototype.slice.call(doc.getElementsByTagName('w:t'));
}
function sokPlain(nodes) {
    return nodes.map(function(node) { return node.textContent || ''; });
}
function sokParaOf(node) {
    var current = node;
    while (current && current.parentNode) {
        if (current.nodeName === 'w:p' || current.localName === 'p') return current;
        current = current.parentNode;
    }
    return node;
}
function sokWrite(nodes, values) {
    values.forEach(function(value, index) { if (nodes[index] && nodes[index].textContent !== value) nodes[index].textContent = value; });
}
function sokReplacePhrase(values, oldPhrase, newPhrase) {
    if (!oldPhrase || !newPhrase || oldPhrase === newPhrase) return;
    for (var i = 0; i < values.length; i++) {
        if (values[i].indexOf(oldPhrase) >= 0) values[i] = values[i].split(oldPhrase).join(newPhrase);
    }
    for (var size = 2; size <= 4; size++) {
        for (var n = 0; n <= values.length - size; n++) {
            if (values.slice(n, n + size).some(function(part) { return part.length > 80; })) continue;
            var joined = values.slice(n, n + size).join('');
            if (joined.indexOf(oldPhrase) < 0) continue;
            values[n] = joined.split(oldPhrase).join(newPhrase);
            for (var k = 1; k < size; k++) values[n + k] = '';
            n += size - 1;
        }
    }
}
function sokReplaceDates(values, date, paras) {
    if (!date) return;
    for (var i = 0; i < values.length; i++) {
        if (values[i].length > 48) {
            values[i] = values[i].replace(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/g, date);
            values[i] = values[i].replace(/[.\u2026]{1,8}\s*\/\s*[.\u2026]{1,8}\s*\/\s*[.\u2026]{2,}/g, date);
            continue;
        }
        var acc = '';
        for (var end = i; end < values.length && end < i + 8 && values[end].length <= 16; end++) {
            if (paras && paras[end] !== paras[i]) break;
            if (end === i && i > 0 && (!paras || paras[i - 1] === paras[i]) && /\d$/.test(values[i - 1] || '')) break;
            acc += values[end];
            if (/^\s*\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}\s*$/.test(acc) || /^\s*[.\u2026]+\s*\/\s*[.\u2026]+\s*\/\s*[.\u2026]+\s*$/.test(acc)) {
                values[i] = date;
                for (var k = i + 1; k <= end; k++) values[k] = '';
                i = end;
                break;
            }
        }
    }
}
function sokReplaceTimes(values, paras, time) {
    if (!time) return;
    var clock = /\d{1,2}:\d{2}/;
    for (var i = 0; i < values.length; i++) {
        if (clock.test(values[i])) values[i] = values[i].replace(/\d{1,2}:\d{2}/g, time);
        values[i] = values[i].replace(/saat\s+[.\u2026]{3,}/gi, 'saat ' + time);
    }
    for (var n = 0; n < values.length; n++) {
        if (clock.test(values[n]) || !/\d|:/.test(values[n])) continue;
        var acc = '';
        for (var end = n; end < values.length && end < n + 6; end++) {
            if (paras && paras[end] !== paras[n]) break;
            if (end !== n && values[end].length > 24) break;
            acc += values[end];
            var found = acc.match(/\d{1,2}:\d{2}/);
            if (!found) continue;
            if (found.index + found[0].length <= values[n].length) break;
            values[n] = acc.slice(0, found.index) + time + acc.slice(found.index + found[0].length);
            for (var k = n + 1; k <= end; k++) values[k] = '';
            n = end;
            break;
        }
    }
    for (var d = 0; d < values.length; d++) {
        if (!/[.\u2026]{3,}/.test(values[d]) || !/^[.\u2026\s]+$/.test(values[d])) continue;
        var around = '';
        for (var b = Math.max(0, d - 4); b < d; b++) {
            if (!paras || paras[b] === paras[d]) around += values[b];
        }
        if (/saat/i.test(around)) values[d] = time;
    }
}
function sokReplaceYears(values, year, paras) {
    if (!year) return;
    for (var i = 0; i < values.length; i++) {
        if (/20\d{2}\s*[-–]\s*20\d{2}/.test(values[i]) || /[.\u2026]{3,}\s*[-–]\s*[.\u2026]{3,}/.test(values[i])) {
            values[i] = values[i].replace(/20\d{2}\s*[-–]\s*20\d{2}/g, year).replace(/[.\u2026]{3,}\s*[-–]\s*[.\u2026]{3,}/g, year);
        }
        if (values[i].length > 12) continue;
        var acc = '';
        for (var end = i; end < values.length && end < i + 8 && values[end].length <= 8; end++) {
            if (paras && paras[end] !== paras[i]) break;
            acc += values[end];
            if (/^\s*20\d{2}\s*[-–]\s*20\d{2}\s*$/.test(acc)) {
                values[i] = year;
                for (var k = i + 1; k <= end; k++) values[k] = '';
                i = end;
                break;
            }
        }
    }
}
function sokReplaceClass(values, oldGrade, oldBranch, grade, branch) {
    var next = grade + '/' + branch;
    var pattern = new RegExp(oldGrade + '\\s*/\\s*' + oldBranch, 'g');
    for (var i = 0; i < values.length; i++) {
        values[i] = values[i].replace(pattern, next);
        values[i] = values[i].replace(/[3-8]\s*\/\s*[.\u2026]{2,}/g, next);
        if (values[i].trim() === oldGrade && values[i + 1] && /^\s*\/\s*$/.test(values[i + 1]) && values[i + 2] && values[i + 2].trim() === oldBranch) {
            values[i] = grade;
            values[i + 1] = '/';
            values[i + 2] = branch;
        }
        if ((values[i].trim() === oldGrade + '/' || values[i].trim() === oldGrade + '/ ') && values[i + 1] && values[i + 1].trim() === oldBranch) {
            values[i] = grade + '/';
            values[i + 1] = branch;
        }
    }
}
function sokDetect(values) {
    var blob = values.slice(0, 50).join('');
    var school = ((blob.match(/([A-ZÇĞİÖŞÜİ0-9][A-ZÇĞİÖŞÜİ0-9 .'\-]{2,}?(?:ORTAOKULU|İLKOKULU|LİSESİ))/) || [])[1] || '').replace(/\s+/g, ' ').trim();
    var klass = blob.match(/([3-8])\s*\/\s*([A-ZÇĞİÖŞÜ])/);
    var year = (blob.match(/20\d{2}\s*[-–]\s*20\d{2}/) || [])[0] || '';
    var teacher = '';
    var principal = '';
    var deputy = '';
    var place = '';
    values.forEach(function(text, index) {
        var up = text.toLocaleUpperCase('tr-TR');
        if (!teacher && /REHBER ÖĞRETMEN/.test(up)) {
            for (var back = index - 1; back >= Math.max(0, index - 6); back--) {
                var name = values[back].trim();
                if (name.split(/\s+/).length >= 2 && name.length < 40 && !/\d/.test(name)) { teacher = name; break; }
            }
        }
        if (!principal && /^OKUL MÜDÜRÜ?$/.test(up.trim()) && !/YARDIM/.test((values[index + 1] || '').toLocaleUpperCase('tr-TR'))) {
            for (var prev = index - 1; prev >= Math.max(0, index - 4); prev--) {
                var who = values[prev].trim();
                if (who.split(/\s+/).length >= 2 && who.length < 40 && !/\d/.test(who)) { principal = who; break; }
            }
        }
        if (!deputy && /MÜDÜR YARDIMC/.test(up)) {
            var after = (values[index + 1] || '').trim();
            if (after.split(/\s+/).length >= 2 && after.length < 40 && !/\d/.test(after)) deputy = after;
        }
        if (!place && /TOPLANTI YERİ/.test(up)) {
            for (var next = index + 1; next < Math.min(values.length, index + 6); next++) {
                var spot = values[next].trim();
                if (spot && spot !== ':' && spot.length > 2 && spot.length < 40) { place = spot; break; }
            }
        }
    });
    return { school: school, grade: klass ? klass[1] : '', branch: klass ? klass[2] : '', year: year, teacher: teacher, principal: principal, deputy: deputy, place: place };
}
function patchSokXml(xml, info) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    var found = sokDetect(sokPlain(sokTexts(doc)));
    sokFillStudents(doc, info.students || []);
    sokFillPeople(doc, info.people || []);
    var nodes = sokTexts(doc);
    var values = sokPlain(nodes);
    var paras = nodes.map(sokParaOf);
    if (found.school && info.school) sokReplacePhrase(values, found.school, info.school);
    if (info.year) sokReplaceYears(values, info.year, paras);
    if (found.grade && found.branch) sokReplaceClass(values, found.grade, found.branch, info.grade, info.branch);
    else sokReplaceClass(values, '5', 'A', info.grade, info.branch);
    sokReplaceDates(values, info.date, paras);
    sokReplaceTimes(values, paras, info.time);
    if (found.place && info.place) sokReplacePhrase(values, found.place, info.place);
    if (found.teacher && info.teacher) sokReplacePhrase(values, found.teacher, info.teacher);
    if (found.principal && info.principal) sokReplacePhrase(values, found.principal, info.principal);
    if (found.deputy && info.deputy) sokReplacePhrase(values, found.deputy, info.deputy);
    sokWrite(nodes, values);
    return new XMLSerializer().serializeToString(doc);
}
function patchSokBuffer(buffer, info) {
    var files = fflate.unzipSync(new Uint8Array(buffer));
    Object.keys(files).forEach(function(name) {
        if (!/word\/(document|header\d*|footer\d*)\.xml$/.test(name)) return;
        var xml = new TextDecoder().decode(files[name]);
        if (name === 'word/document.xml') files[name] = new TextEncoder().encode(patchSokXml(xml, info));
        else {
            var doc = new DOMParser().parseFromString(xml, 'text/xml');
            var values = sokPlain(sokTexts(doc));
            var found = sokDetect(values);
            if (found.school && info.school) sokReplacePhrase(values, found.school, info.school);
            if (info.year) sokReplaceYears(values, info.year);
            sokWrite(sokTexts(doc), values);
            files[name] = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
        }
    });
    return fflate.zipSync(files);
}
function buildSok() {
    var kind = document.getElementById('sok-kind').value;
    var grade = document.getElementById('sok-grade').value;
    var branch = document.getElementById('sok-branch').value;
    var dateIso = document.getElementById('sok-date').value;
    var time = document.getElementById('sok-time').value;
    var place = document.getElementById('sok-place').value.trim();
    var people = document.getElementById('sok-people').value.split('\n').map(sokSplitPerson).filter(function(person) { return person.name; });
    var students = officeStudents(grade, branch);
    if (!students.length) return alert('Bu şubede öğrenci yok.');
    if (!people.length) return alert('Öğretmen yaz.');
    if (!window.fflate) return alert('Sayfayı yenile.');
    officeFileGet('sok-tpl-' + kind).then(function(buffer) {
        if (!buffer) return alert('Önce bu tip için taslak yükle.');
        var staff = officeStaff();
        var teacher = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.full_name) || '';
        var school = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_name) || '';
        var year = typeof currentPortalYear === 'function' ? currentPortalYear() : '';
        var date = String(dateIso || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, function(_, y, m, d) { return d + '/' + m + '/' + y; });
        var info = {
            school: school, year: year, grade: grade, branch: branch, date: date, time: time, place: place,
            teacher: teacher, principal: staff.principal || '', deputy: (staff.deputies || [])[0] || '',
            students: students, people: people
        };
        var bytes = patchSokBuffer(buffer, info);
        var id = 's' + Date.now();
        var label = ((sokKinds().filter(function(item) { return item.id === kind; })[0] || {}).label || 'ŞÖK') + ' ' + grade + '/' + branch;
        return officeFilePut('sok-doc-' + id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then(function() {
            var bag = officeBag();
            bag.sokSaved = bag.sokSaved || [];
            bag.sokSaved.unshift({ id: id, label: label, date: date, place: place, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            saveBlob(bytes, label + ' ŞÖK.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        });
    }).catch(function(err) { alert('ŞÖK oluşturulamadı. ' + (err && err.message ? err.message : '')); });
}
function openSokSaved() {
    var rows = (officeBag().sokSaved || []).map(function(item) {
        return {
            item: { source: 'sok', id: item.id, name: item.label || 'ŞÖK', when: [item.date, item.place, item.when].filter(Boolean).join(' · ') },
            extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteSokSaved(\'' + item.id + '\')">Sil</button>'
        };
    });
    officeShell('Kayıtlı ŞÖK', rows.length ? officeDocTable(rows, true) : '<p style="color:#fff;">Henüz oluşturulmuş ŞÖK yok.</p>', '', 'sok-saved');
}
function deleteSokSaved(id) {
    if (!confirm('Bu ŞÖK silinsin mi?')) return;
    var bag = officeBag();
    bag.sokSaved = (bag.sokSaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('sok-doc-' + id).then(function() {
        window._skipHistory = true;
        openSokSaved();
        window._skipHistory = false;
    });
}
function downloadSavedSok(id) {
    officeFileGet('sok-doc-' + id).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        var item = (officeBag().sokSaved || []).filter(function(row) { return row.id === id; })[0] || {};
        saveBlob(new Uint8Array(buffer), (item.label || 'ŞÖK') + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
}

function openRehber() {
    officeShell('Sınıf Rehberlik', officeCards([
        { title: 'Yıllık plan', text: 'Ekle, oluştur, indir', click: "openEvrakScreen('rehber-yillik')" },
        { title: 'Aylık rapor', text: 'Ayın kazanımları', click: "openEvrakScreen('rehber-month')" },
        { title: 'Oturma planı', text: 'Öğrenci yerleştir', click: "openEvrakScreen('rehber-seat')" },
        { title: 'Seçim tutanağı', text: 'Başkan ve kurul', click: "openEvrakScreen('rehber-vote')" },
        { title: 'Nöbet listesi', text: 'Tarih aralığı', click: "openEvrakScreen('rehber-duty')" }
    ]), '', 'rehber');
}
function rehberMonths() {
    return ['Eylül', 'Ekim', 'Kasım', 'Aralık', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
}
function rehberGradeOptions() {
    return ['5', '6', '7', '8'].map(function(grade) { return '<option>' + grade + '</option>'; }).join('');
}
function rehberMonthOptions() {
    return rehberMonths().map(function(month) { return '<option>' + month + '</option>'; }).join('');
}
function fillRehberBranches(gradeId, branchId) {
    var gradeEl = document.getElementById(gradeId);
    var sel = document.getElementById(branchId);
    if (!gradeEl || !sel) return;
    var names = Object.keys((typeof fenData !== 'undefined' && fenData[gradeEl.value] && fenData[gradeEl.value].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option>A</option>';
}
function rehberCounselorOptions() {
    var list = officeBag().counselors || [];
    return '<option value="">Rehber öğretmen yok</option>' + list.map(function(name) {
        return '<option>' + officeEsc(name) + '</option>';
    }).join('');
}
function openRehberYear() {
    officeShell('Yıllık plan', officeCards([
        { title: 'Yıllık plan ekle', text: 'Sınıf seç, Word yükle', click: "openEvrakScreen('rehber-yillik-up')" },
        { title: 'Oluştur', text: 'Şube ve imza', click: "openEvrakScreen('rehber-yillik-build')" },
        { title: 'Kayıtlı', text: 'Word indir', click: "openEvrakScreen('rehber-yillik-saved')" }
    ]), '', 'rehber-yillik');
}
function openRehberPlanUpload() {
    var skip = window._skipHistory;
    var plans = officeBag().rehberPlans || {};
    var counselors = officeBag().counselors || [];
    var cards = ['5', '6', '7', '8'].map(function(grade) {
        var info = plans[grade];
        if (!info) return '';
        return '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteRehberPlan(\'' + grade + '\')">Sil</button><h3>' + grade + '. sınıf</h3><p>' + officeEsc(info.name || 'Word') + '</p><p>' + officeEsc(info.when || '') + '</p></div>';
    }).join('');
    var people = counselors.map(function(name, index) {
        return '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteRehberCounselor(' + index + ')">Sil</button><h3>' + officeEsc(name) + '</h3><p>Okul rehber öğretmeni</p></div>';
    }).join('');
    officeShell('Yıllık plan ekle',
        '<p style="color:#fff;">Sınıfı seçip o sınıfın yıllık rehberlik planını yükle. Varsa okul rehber öğretmenini de kaydet.</p>' +
        '<select id="rehber-up-grade" class="auth-input">' + rehberGradeOptions() + '</select>' +
        '<input id="rehber-up-file" type="file" accept=".docx" class="auth-input">' +
        '<button class="auth-btn" onclick="saveRehberPlan()">Yükle</button>' +
        (cards ? '<div class="grade-cards-grid">' + cards + '</div>' : '<p style="color:#fff;">Henüz yıllık plan yok.</p>') +
        '<input id="rehber-counselor" class="auth-input" placeholder="Okul rehber öğretmeni ad soyad">' +
        '<button class="auth-btn" onclick="saveRehberCounselor()">Rehber öğretmeni kaydet</button>' +
        (people ? '<div class="grade-cards-grid">' + people + '</div>' : ''),
        '', 'rehber-yillik-up');
    if (skip) window._skipHistory = false;
}
function saveRehberPlan() {
    var grade = document.getElementById('rehber-up-grade').value;
    var file = document.getElementById('rehber-up-file').files[0];
    if (!file) return alert('Word dosyası seç.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('rehber-plan-' + grade, reader.result).then(function() {
            var bag = officeBag();
            bag.rehberPlans = bag.rehberPlans || {};
            bag.rehberPlans[grade] = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            window._skipHistory = true;
            openRehberPlanUpload();
            window._skipHistory = false;
        });
    };
    reader.readAsArrayBuffer(file);
}
function deleteRehberPlan(grade) {
    if (!confirm(grade + '. sınıf planı silinsin mi?')) return;
    var bag = officeBag();
    if (bag.rehberPlans) delete bag.rehberPlans[grade];
    officeWrite(bag);
    officeFileDel('rehber-plan-' + grade).then(function() {
        window._skipHistory = true;
        openRehberPlanUpload();
        window._skipHistory = false;
    });
}
function saveRehberCounselor() {
    var name = document.getElementById('rehber-counselor').value.trim();
    if (!name) return alert('Ad soyad yaz.');
    var bag = officeBag();
    bag.counselors = bag.counselors || [];
    bag.counselors.push(name);
    officeWrite(bag);
    window._skipHistory = true;
    openRehberPlanUpload();
    window._skipHistory = false;
}
function deleteRehberCounselor(index) {
    var bag = officeBag();
    bag.counselors = (bag.counselors || []).filter(function(_, i) { return i !== index; });
    officeWrite(bag);
    window._skipHistory = true;
    openRehberPlanUpload();
    window._skipHistory = false;
}
function openRehberYearBuild() {
    officeShell('Yıllık plan oluştur',
        '<p style="color:#fff;">Yüklediğin sınıf planı açılır. Okul, yıl, şube, öğretmen ve müdür ilgili yerlere yazılır.</p>' +
        '<select id="rehber-year-grade" class="auth-input" onchange="fillRehberBranches(\'rehber-year-grade\',\'rehber-year-branch\')">' + rehberGradeOptions() + '</select>' +
        '<select id="rehber-year-branch" class="auth-input"></select>' +
        '<select id="rehber-year-counselor" class="auth-input">' + rehberCounselorOptions() + '</select>' +
        '<input id="rehber-year-date" type="date" class="auth-input">' +
        '<button class="auth-btn" onclick="buildRehberYear()">Oluştur ve Word indir</button>',
        '', 'rehber-yillik-build');
    fillRehberBranches('rehber-year-grade', 'rehber-year-branch');
}
function openRehberMonthHome() {
    officeShell('Aylık rapor', officeCards([
        { title: 'Taslak ekle', text: 'Aylık rapor Word', click: "openEvrakScreen('rehber-month-up')" },
        { title: 'Oluştur', text: 'Ayın kazanımları', click: "openEvrakScreen('rehber-month-build')" },
        { title: 'Kayıtlı', text: 'Word indir', click: "openEvrakScreen('rehber-month-saved')" }
    ]), '', 'rehber-month');
}
function openRehberMonthUpload() {
    var skip = window._skipHistory;
    var info = officeBag().rehberMonthTpl;
    var card = info ? '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteRehberMonthTpl()">Sil</button><h3>Aylık taslak</h3><p>' + officeEsc(info.name || 'Word') + '</p><p>' + officeEsc(info.when || '') + '</p></div>' : '<p style="color:#fff;">Henüz taslak yok.</p>';
    officeShell('Aylık taslak',
        '<p style="color:#fff;">Boş aylık rehberlik raporunu bir kez yükle. Her ay bu taslağın üzerine yazılır.</p>' +
        '<input id="rehber-month-file" type="file" accept=".docx" class="auth-input">' +
        '<button class="auth-btn" onclick="saveRehberMonthTpl()">Yükle</button>' + card,
        '', 'rehber-month-up');
    if (skip) window._skipHistory = false;
}
function saveRehberMonthTpl() {
    var file = document.getElementById('rehber-month-file').files[0];
    if (!file) return alert('Word dosyası seç.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('rehber-month-tpl', reader.result).then(function() {
            var bag = officeBag();
            bag.rehberMonthTpl = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            window._skipHistory = true;
            openRehberMonthUpload();
            window._skipHistory = false;
        });
    };
    reader.readAsArrayBuffer(file);
}
function deleteRehberMonthTpl() {
    if (!confirm('Aylık taslak silinsin mi?')) return;
    var bag = officeBag();
    delete bag.rehberMonthTpl;
    officeWrite(bag);
    officeFileDel('rehber-month-tpl').then(function() {
        window._skipHistory = true;
        openRehberMonthUpload();
        window._skipHistory = false;
    });
}
function openRehberMonthBuild() {
    officeShell('Aylık rapor oluştur',
        '<p style="color:#fff;">Sınıf, şube ve ayı seç. Yıllık plandaki o ayın kazanımları taslağa yazılır.</p>' +
        '<select id="rehber-month-grade" class="auth-input" onchange="fillRehberBranches(\'rehber-month-grade\',\'rehber-month-branch\')">' + rehberGradeOptions() + '</select>' +
        '<select id="rehber-month-branch" class="auth-input"></select>' +
        '<select id="rehber-month-name" class="auth-input">' + rehberMonthOptions() + '</select>' +
        '<input id="rehber-month-date" type="date" class="auth-input">' +
        '<button class="auth-btn" onclick="buildRehberMonth()">Oluştur ve Word indir</button>',
        '', 'rehber-month-build');
    fillRehberBranches('rehber-month-grade', 'rehber-month-branch');
}
function rehberInfo(grade, branch, dateIso, counselor) {
    var staff = officeStaff();
    var teacher = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.full_name) || '';
    var school = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_name) || '';
    if (!school) {
        try { school = localStorage.getItem('fen_school_name') || ''; } catch (e) {}
    }
    if (!school) {
        var schoolId = (typeof currentTeacher !== 'undefined' && currentTeacher && currentTeacher.school_id) || '';
        var row = ((typeof portalCatalog !== 'undefined' && portalCatalog.schools) || []).find(function(item) { return item.id === schoolId; });
        school = (row && row.name) || '';
    }
    var year = typeof currentPortalYear === 'function' ? currentPortalYear() : '';
    var date = String(dateIso || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, function(_, y, m, d) { return d + '/' + m + '/' + y; });
    return {
        school: school, year: year, grade: grade, branch: branch, date: date,
        teacher: teacher, counselor: counselor || '', principal: staff.principal || '',
        students: officeStudents(grade, branch)
    };
}
function rehberParaIndexes(paras) {
    var groups = [];
    var seen = [];
    paras.forEach(function(para, index) {
        var at = seen.indexOf(para);
        if (at < 0) { seen.push(para); groups.push([index]); }
        else groups[at].push(index);
    });
    return groups;
}
function rehberParaString(values, indexes) {
    return indexes.map(function(index) { return values[index]; }).join('');
}
function rehberSetPara(values, indexes, text) {
    if (!indexes.length) return;
    values[indexes[0]] = text;
    for (var i = 1; i < indexes.length; i++) values[indexes[i]] = '';
}
function rehberApplySchool(values, paras, school) {
    var short = String(school || '').replace(/\s*(ORTAOKULU|İLKOKULU|LİSESİ).*$/i, '').trim();
    if (!short) return;
    for (var i = 0; i < values.length; i++) {
        if (!/ORTAOKULU/.test(values[i])) continue;
        values[i] = values[i].replace(/[._\u2026]{3,}\s*(?=ORTAOKULU)/, short + ' ');
        if (values[i].indexOf('ORTAOKULU') === 0 || /^\s*ORTAOKULU/.test(values[i])) {
            for (var b = i - 1; b >= 0 && paras[b] === paras[i]; b--) {
                if (!values[b].trim()) continue;
                values[b] = short;
                break;
            }
        }
    }
}
function rehberApplyClass(values, paras, grade, branch) {
    var klass = grade + '/' + branch;
    for (var i = 0; i < values.length; i++) {
        values[i] = values[i].replace(/[3-8]\s*\/\s*[.\u2026]{2,}/g, klass);
        if (!/^[3-8]$/.test((values[i] || '').trim()) || !values[i + 1] || paras[i + 1] !== paras[i]) continue;
        var next = values[i + 1].trim();
        if (next !== '/' && !/^\/[.\u2026A-ZÇĞİÖŞÜ]/.test(next)) continue;
        values[i] = grade;
        if (next === '/' && values[i + 2] && paras[i + 2] === paras[i] && /^[A-ZÇĞİÖŞÜ.\u2026_]+$/.test(values[i + 2].trim())) {
            values[i + 1] = '/';
            values[i + 2] = branch;
        } else {
            values[i + 1] = '/' + branch;
            if (values[i + 2] && paras[i + 2] === paras[i] && /^[.\u2026\s]+$/.test(values[i + 2])) values[i + 2] = '';
        }
    }
    if (!grade || !branch) return;
    var groups = rehberParaIndexes(paras);
    groups.forEach(function(indexes) {
        var text = rehberParaString(values, indexes);
        if (!/sınıf|şube|rehber öğretmen/i.test(text)) return;
        var next = text.replace(/[3-8]\s*\/\s*[A-ZÇĞİÖŞÜ]/g, klass);
        if (next !== text) rehberSetPara(values, indexes, next);
    });
}
function rehberApplyPeople(values, paras, info) {
    var groups = rehberParaIndexes(paras);
    groups.forEach(function(indexes, groupIndex) {
        var text = rehberParaString(values, indexes).replace(/\s+/g, ' ').trim();
        var next = groups[groupIndex + 1] ? rehberParaString(values, groups[groupIndex + 1]).replace(/\s+/g, ' ').trim() : '';
        if (/^sınıf öğretmeni:?$/i.test(text) && groups[groupIndex + 1] && info.teacher) rehberSetPara(values, groups[groupIndex + 1], info.teacher);
        if (/okul rehber/i.test(next) && /sınıf rehber/i.test(next)) return;
        else if (/^sınıf rehber öğretmeni$/i.test(next) && text && text.length < 60 && info.teacher) {
            rehberSetPara(values, indexes, info.teacher);
        }
        if (/^okul müdür[üu]?$/i.test(text) && groups[groupIndex - 1] && info.principal) rehberSetPara(values, groups[groupIndex - 1], info.principal);
    });
}
function rehberPatchYearXml(xml, info) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    var nodes = sokTexts(doc);
    var values = sokPlain(nodes);
    var paras = nodes.map(sokParaOf);
    if (info.year) {
        sokReplaceYears(values, info.year, paras);
        for (var i = 0; i < values.length; i++) {
            if (values[i].length < 24) values[i] = values[i].replace(/[.\u2026]{1,3}\s*[-–]\s*[.\u2026]{1,3}/g, info.year);
        }
    }
    rehberApplySchool(values, paras, info.school);
    rehberApplyClass(values, paras, info.grade, info.branch);
    rehberApplyPeople(values, paras, info);
    if (info.date) sokReplaceDates(values, info.date, paras);
    sokWrite(nodes, values);
    rehberFixSign(doc, info);
    rehberRebuildYearSign(doc, info);
    return new XMLSerializer().serializeToString(doc);
}
function rehberBullets(xml, month) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var want = String(month || '').toLocaleUpperCase('tr-TR');
    var names = rehberMonths().map(function(item) { return item.toLocaleUpperCase('tr-TR'); });
    var paras = doc.getElementsByTagName('w:p');
    var on = false;
    var found = [];
    for (var i = 0; i < paras.length; i++) {
        var text = Array.prototype.map.call(paras[i].getElementsByTagName('w:t'), function(node) { return node.textContent || ''; }).join('').trim();
        var key = text.toLocaleUpperCase('tr-TR');
        if (names.indexOf(key) >= 0) { on = key === want; continue; }
        if (!on || !text) continue;
        var props = paras[i].getElementsByTagName('w:numPr');
        if (props.length) found.push(text);
    }
    return found;
}
function rehberSplitWeeks(items) {
    var weeks = [[], [], [], []];
    items.forEach(function(item, index) {
        var at = items.length ? Math.min(3, Math.floor(index * 4 / items.length)) : 0;
        weeks[at].push(item);
    });
    return weeks;
}
function rehberSetLines(cell, lines) {
    if (!lines || !lines.length) return;
    var texts = cell.getElementsByTagName('w:t');
    if (!texts.length) return sokSetCell(cell, lines.join(' • '));
    var run = texts[0].parentNode;
    texts[0].textContent = '• ' + lines[0];
    texts[0].setAttribute('xml:space', 'preserve');
    for (var i = 1; i < texts.length; i++) texts[i].textContent = '';
    for (var n = 1; n < lines.length; n++) {
        var br = cell.ownerDocument.createElementNS(run.namespaceURI, 'w:br');
        var node = cell.ownerDocument.createElementNS(run.namespaceURI, 'w:t');
        node.setAttribute('xml:space', 'preserve');
        node.textContent = '• ' + lines[n];
        run.appendChild(br);
        run.appendChild(node);
    }
}
function rehberCellText(cell) {
    return Array.prototype.map.call(cell.getElementsByTagName('w:t'), function(node) { return node.textContent || ''; }).join('').replace(/\s+/g, ' ').trim();
}
function officeSignTable(doc, columns) {
    var ns = (doc.documentElement && doc.documentElement.namespaceURI) || 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    function node(name) { return doc.createElementNS(ns, name); }
    var table = node('w:tbl');
    var props = node('w:tblPr');
    var width = node('w:tblW');
    width.setAttribute('w:w', '5000');
    width.setAttribute('w:type', 'pct');
    var align = node('w:jc');
    align.setAttribute('w:val', 'center');
    props.appendChild(width);
    props.appendChild(align);
    var borders = node('w:tblBorders');
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach(function(edge) {
        var border = node('w:' + edge);
        border.setAttribute('w:val', 'nil');
        borders.appendChild(border);
    });
    props.appendChild(borders);
    table.appendChild(props);
    var grid = node('w:tblGrid');
    columns.forEach(function() {
        var col = node('w:gridCol');
        col.setAttribute('w:w', String(Math.max(1400, Math.floor(9360 / columns.length))));
        grid.appendChild(col);
    });
    table.appendChild(grid);
    function row(key, bold) {
        var line = node('w:tr');
        var trPr = node('w:trPr');
        trPr.appendChild(node('w:cantSplit'));
        line.appendChild(trPr);
        columns.forEach(function(column) {
            var cell = node('w:tc');
            var cellProps = node('w:tcPr');
            var cellWidth = node('w:tcW');
            cellWidth.setAttribute('w:w', String(Math.max(1400, Math.floor(9360 / columns.length))));
            cellWidth.setAttribute('w:type', 'dxa');
            cellProps.appendChild(cellWidth);
            cell.appendChild(cellProps);
            var para = node('w:p');
            var paraProps = node('w:pPr');
            var paraAlign = node('w:jc');
            paraAlign.setAttribute('w:val', 'center');
            paraProps.appendChild(paraAlign);
            para.appendChild(paraProps);
            var run = node('w:r');
            var runProps = node('w:rPr');
            if (bold) runProps.appendChild(node('w:b'));
            var size = node('w:sz');
            size.setAttribute('w:val', '20');
            runProps.appendChild(size);
            var text = node('w:t');
            text.textContent = column[key] || '';
            run.appendChild(runProps);
            run.appendChild(text);
            para.appendChild(run);
            cell.appendChild(para);
            line.appendChild(cell);
        });
        return line;
    }
    table.appendChild(row('name', true));
    table.appendChild(row('role', false));
    return table;
}
function rehberApplySign(doc, info) {
    var paras = doc.getElementsByTagName('w:p');
    var title = null;
    var prev = null;
    for (var i = 0; i < paras.length; i++) {
        var text = rehberCellText(paras[i]);
        if (/SINIF ÖĞRETMENİ/.test(text) && /OKUL MÜDÜRÜ/.test(text)) {
            title = paras[i];
            prev = i ? paras[i - 1] : null;
            break;
        }
    }
    if (!title || !title.parentNode) return;
    var counselor = info.counselor || ((officeBag().counselors || [])[0] || '');
    var columns = [
        { name: (info.teacher || '').toLocaleUpperCase('tr-TR'), role: 'SINIF ÖĞRETMENİ' },
        { name: counselor.toLocaleUpperCase('tr-TR'), role: 'OKUL REHBER ÖĞRETMENİ' },
        { name: (info.principal || '').toLocaleUpperCase('tr-TR'), role: 'OKUL MÜDÜRÜ' }
    ];
    title.parentNode.insertBefore(officeSignTable(doc, columns), title);
    title.parentNode.removeChild(title);
    if (prev && prev.parentNode && rehberCellText(prev).length < 120) prev.parentNode.removeChild(prev);
}
function rehberRebuildYearSign(doc, info) {
    var paras = Array.prototype.slice.call(doc.getElementsByTagName('w:p'));
    var klass = ((info.grade || '') + (info.branch ? '/' + info.branch : '')).replace(/^\//, '');
    var ns = (doc.documentElement && doc.documentElement.namespaceURI) || 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    for (var i = 0; i < paras.length; i++) {
        var text = rehberCellText(paras[i]);
        if (!/okul rehber/i.test(text) || !/sınıf rehber/i.test(text)) continue;
        var parent = paras[i].parentNode;
        if (!parent) continue;
        var columns = [
            { name: (info.counselor || '').toLocaleUpperCase('tr-TR'), role: 'Okul Rehber Öğretmeni' },
            { name: (info.teacher || '').toLocaleUpperCase('tr-TR'), role: (klass ? klass + ' ' : '') + 'Sınıf Rehber Öğretmeni' }
        ];
        var table = officeSignTable(doc, columns);
        var gap = doc.createElementNS(ns, 'w:p');
        parent.insertBefore(gap, paras[i]);
        parent.insertBefore(table, paras[i]);
        var prev = gap.previousSibling;
        while (prev && prev.nodeType !== 1) prev = prev.previousSibling;
        if (prev && prev.tagName === 'w:p') {
            var prevText = rehberCellText(prev);
            if (prevText.length < 90 && !/uygundur|müdür|not:|planına/i.test(prevText)) parent.removeChild(prev);
        }
        parent.removeChild(paras[i]);
        return;
    }
}
function rehberSetSignCell(cell, name, role) {
    var doc = cell.ownerDocument;
    var ns = cell.namespaceURI || 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    var tcPr = doc.createElementNS(ns, 'w:tcPr');
    var tcW = doc.createElementNS(ns, 'w:tcW');
    tcW.setAttribute('w:w', '3000');
    tcW.setAttribute('w:type', 'dxa');
    tcPr.appendChild(tcW);
    cell.appendChild(tcPr);
    function para(text, bold) {
        var line = doc.createElementNS(ns, 'w:p');
        var props = doc.createElementNS(ns, 'w:pPr');
        var align = doc.createElementNS(ns, 'w:jc');
        align.setAttribute('w:val', 'center');
        props.appendChild(align);
        line.appendChild(props);
        if (text) {
            var run = doc.createElementNS(ns, 'w:r');
            if (bold) {
                var runProps = doc.createElementNS(ns, 'w:rPr');
                runProps.appendChild(doc.createElementNS(ns, 'w:b'));
                run.appendChild(runProps);
            }
            var textNode = doc.createElementNS(ns, 'w:t');
            textNode.textContent = text;
            run.appendChild(textNode);
            line.appendChild(run);
        }
        cell.appendChild(line);
    }
    if (!name && !role) { para('', false); return; }
    para(String(name || '').toLocaleUpperCase('tr-TR'), true);
    para(role || '', false);
}
function rehberFixSign(doc, info) {
    var klass = ((info.grade || '') + (info.branch ? '/' + info.branch : '')).replace(/^\//, '');
    var tables = doc.getElementsByTagName('w:tbl');
    for (var t = 0; t < tables.length; t++) {
        var cells = tables[t].getElementsByTagName('w:tc');
        var blob = '';
        for (var c = 0; c < cells.length; c++) blob += ' ' + rehberCellText(cells[c]);
        if (!/REHBER ÖĞRETMEN/i.test(blob) && !/OKUL MÜDÜR/i.test(blob)) continue;
        for (var i = 0; i < cells.length; i++) {
            var text = rehberCellText(cells[i]);
            if (/OKUL REHBER/i.test(text)) rehberSetSignCell(cells[i], info.counselor, 'Okul Rehber Öğretmeni');
            else if (/SINIF REHBER|SINIF ÖĞRETMEN/i.test(text)) rehberSetSignCell(cells[i], info.teacher, (klass ? klass + ' ' : '') + 'Sınıf Rehber Öğretmeni');
            else if (/OKUL MÜDÜR/i.test(text)) rehberSetSignCell(cells[i], info.principal, 'Okul Müdürü');
            else if (text && text.length < 50 && !/\d/.test(text)) rehberSetSignCell(cells[i], '', '');
        }
    }
}
function rehberFillMonthTable(doc, info, weeks) {
    var rows = doc.getElementsByTagName('w:tr');
    var gain = 0;
    for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].getElementsByTagName('w:tc');
        for (var c = 0; c < cells.length; c++) {
            var label = rehberCellText(cells[c]).toLocaleUpperCase('tr-TR');
            var next = cells[c + 1];
            if (!next) continue;
            if (label === 'SINIF ÖĞRETMENİ' && info.teacher) sokSetCell(next, info.teacher);
            if (label === 'SINIF MEVCUDU') sokSetCell(next, String((info.students || []).length));
            if (label === 'RAPOR NO') sokSetCell(next, String(info.reportNo || ''));
            if (label === 'RAPOR TARİHİ' && info.date) sokSetCell(next, info.date);
            if (label === 'KAZANIM' && weeks[gain]) rehberSetLines(next, weeks[gain++]);
        }
    }
}
function rehberPatchMonthXml(xml, info, bullets) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    var nodes = sokTexts(doc);
    var values = sokPlain(nodes);
    var paras = nodes.map(sokParaOf);
    var year = info.year || '';
    for (var i = 0; i < values.length; i++) {
        var acc = '';
        for (var end = i; end < values.length && end < i + 6 && values[end].length <= 12 && paras[end] === paras[i]; end++) {
            acc += values[end];
            if (/^20\s*_{2,}\s*[-–]\s*20\s*_{2,}$/.test(acc) && year) {
                values[i] = year;
                for (var k = i + 1; k <= end; k++) values[k] = '';
                i = end;
                break;
            }
        }
        if (/^_{2,}$/.test((values[i] || '').trim()) && values[i + 1] && /AYI/i.test(values[i + 1])) values[i] = String(info.month || '').toLocaleUpperCase('tr-TR');
    }
    rehberApplySchool(values, paras, info.school);
    rehberApplyClass(values, paras, info.grade, info.branch);
    if (info.date) sokReplaceDates(values, info.date, paras);
    sokWrite(nodes, values);
    rehberFillMonthTable(doc, info, rehberSplitWeeks(bullets || []));
    rehberApplySign(doc, info);
    return new XMLSerializer().serializeToString(doc);
}
function rehberPack(buffer, xml) {
    var files = fflate.unzipSync(new Uint8Array(buffer));
    files['word/document.xml'] = new TextEncoder().encode(xml);
    return fflate.zipSync(files);
}
function rehberStore(kind, label, bytes, extra) {
    var id = 'r' + Date.now();
    return officeFilePut('rehber-doc-' + id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then(function() {
        var bag = officeBag();
        bag.rehberSaved = bag.rehberSaved || [];
        bag.rehberSaved.unshift(Object.assign({ id: id, kind: kind, label: label, when: new Date().toLocaleString('tr-TR') }, extra || {}));
        officeWrite(bag);
        saveBlob(bytes, label + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
}
function buildRehberYear() {
    var grade = document.getElementById('rehber-year-grade').value;
    var branch = document.getElementById('rehber-year-branch').value;
    var counselor = document.getElementById('rehber-year-counselor').value;
    var info = rehberInfo(grade, branch, document.getElementById('rehber-year-date').value, counselor);
    if (!window.fflate) return alert('Sayfayı yenile.');
    officeFileGet('rehber-plan-' + grade).then(function(buffer) {
        if (!buffer) return alert('Önce ' + grade + '. sınıf yıllık planını yükle.');
        var xml = new TextDecoder().decode(fflate.unzipSync(new Uint8Array(buffer))['word/document.xml']);
        var bytes = rehberPack(buffer, rehberPatchYearXml(xml, info));
        return rehberStore('yillik', grade + '/' + branch + ' Rehberlik Yıllık Plan', bytes);
    }).catch(function(err) { alert('Plan oluşturulamadı. ' + (err && err.message ? err.message : '')); });
}
function buildRehberMonth() {
    var grade = document.getElementById('rehber-month-grade').value;
    var branch = document.getElementById('rehber-month-branch').value;
    var month = document.getElementById('rehber-month-name').value;
    var counselor = (officeBag().counselors || [])[0] || '';
    var info = rehberInfo(grade, branch, document.getElementById('rehber-month-date').value, counselor);
    info.month = month;
    info.reportNo = rehberMonths().indexOf(month) + 1;
    if (!window.fflate) return alert('Sayfayı yenile.');
    Promise.all([officeFileGet('rehber-month-tpl'), officeFileGet('rehber-plan-' + grade)]).then(function(files) {
        if (!files[0]) return alert('Önce aylık rapor taslağını yükle.');
        if (!files[1]) return alert('Önce ' + grade + '. sınıf yıllık planını yükle.');
        var planXml = new TextDecoder().decode(fflate.unzipSync(new Uint8Array(files[1]))['word/document.xml']);
        var bullets = rehberBullets(planXml, month);
        if (!bullets.length) return alert('Yıllık planda ' + month + ' kazanımı bulunamadı.');
        var monthXml = new TextDecoder().decode(fflate.unzipSync(new Uint8Array(files[0]))['word/document.xml']);
        var bytes = rehberPack(files[0], rehberPatchMonthXml(monthXml, info, bullets));
        return rehberStore('aylik', grade + '/' + branch + ' ' + month + ' Rehberlik Raporu', bytes);
    }).catch(function(err) { alert('Rapor oluşturulamadı. ' + (err && err.message ? err.message : '')); });
}
function openRehberSaved(kind) {
    var title = kind === 'yillik' ? 'Kayıtlı yıllık planlar' : 'Kayıtlı aylık raporlar';
    var list = rehberSavedHtml(kind);
    officeShell(title, list || '<p style="color:#fff;">Henüz kayıt yok.</p>', '', kind === 'yillik' ? 'rehber-yillik-saved' : 'rehber-month-saved');
}
function deleteRehberSaved(id, kind) {
    if (!confirm('Silinsin mi?')) return;
    var bag = officeBag();
    bag.rehberSaved = (bag.rehberSaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('rehber-doc-' + id).then(function() {
        window._skipHistory = true;
        if (kind === 'oturma') openRehberSeat();
        else if (kind === 'secim') openRehberVote();
        else if (kind === 'nobet') openRehberDuty();
        else if (kind === 'kulup') openKulupSaved();
        else openRehberSaved(kind);
        window._skipHistory = false;
    });
}
function downloadRehberSaved(id) {
    officeFileGet('rehber-doc-' + id).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        var item = (officeBag().rehberSaved || []).filter(function(row) { return row.id === id; })[0] || {};
        saveBlob(new Uint8Array(buffer), (item.label || 'Rehberlik') + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
}
function docxEsc(value) {
    return String(value || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function docxRun(text, opts) {
    opts = opts || {};
    var bold = opts.bold ? '<w:b/>' : '';
    var size = opts.size || 22;
    var color = opts.color ? '<w:color w:val="' + opts.color + '"/>' : '';
    return '<w:r><w:rPr>' + bold + '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' + color +
        '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t xml:space="preserve">' + docxEsc(text) + '</w:t></w:r>';
}
function docxP(text, opts) {
    opts = opts || {};
    var lines = Array.isArray(text) ? text : String(text == null ? '' : text).split('\n');
    var body = '';
    lines.forEach(function(line, index) {
        if (index) body += '<w:r><w:br/></w:r>';
        body += docxRun(line, opts);
    });
    return '<w:p><w:pPr><w:jc w:val="' + (opts.align || 'left') + '"/><w:spacing w:before="0" w:after="' + (opts.after == null ? 80 : opts.after) + '"/></w:pPr>' + body + '</w:p>';
}
function docxBorders() {
    return '<w:tcBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:left w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:right w:val="single" w:sz="8" w:space="0" w:color="1F2937"/></w:tcBorders>';
}
function docxCell(inner, opts) {
    opts = opts || {};
    var fill = opts.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.fill + '"/>' : '';
    var span = opts.span ? '<w:gridSpan w:val="' + opts.span + '"/>' : '';
    return '<w:tc><w:tcPr><w:tcW w:w="' + (opts.w || 1800) + '" w:type="dxa"/>' + span + docxBorders() + fill + '<w:vAlign w:val="center"/></w:tcPr>' + inner + '</w:tc>';
}
function docxGap() {
    return '<w:tc><w:tcPr><w:tcW w:w="400" w:type="dxa"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr><w:p/></w:tc>';
}
function docxPack(body) {
    var document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>';
    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var files = {};
    files['[Content_Types].xml'] = new TextEncoder().encode(types);
    files['_rels/.rels'] = new TextEncoder().encode(rels);
    files['word/document.xml'] = new TextEncoder().encode(document);
    return fflate.zipSync(files);
}
function rehberSavedHtml(kind) {
    var rows = (officeBag().rehberSaved || []).filter(function(item) { return item.kind === kind; }).map(function(item) {
        return {
            item: { source: 'rehber', id: item.id, name: item.label || '', when: item.when || '' },
            extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteRehberSaved(\'' + item.id + '\',\'' + kind + '\')">Sil</button>'
        };
    });
    return rows.length ? officeDocTable(rows, true) : '';
}
function trVoteWords(value) {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return '';
    var ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
    var tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];
    if (n < 10) return n === 0 ? 'SIFIR' : ones[n];
    if (n < 100) return (tens[Math.floor(n / 10)] + ' ' + ones[n % 10]).trim();
    if (n === 100) return 'YÜZ';
    return String(n);
}
function openRehberSeat() {
    if (!window._seatPicks || window._seatPicks.length !== 24) window._seatPicks = Array(24).fill('');
    var saved = rehberSavedHtml('oturma');
    officeShell('Oturma planı',
        '<p style="color:#fff;">Yazı tahtası önde. Her sıra iki öğrencidir. Seçilen öğrenci başka sırada çıkmaz.</p>' +
        '<select id="seat-grade" class="auth-input" onchange="fillSeatBranches()"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="seat-branch" class="auth-input" onchange="resetSeats()"></select>' +
        '<div id="seat-board"></div>' +
        '<button class="auth-btn" onclick="saveSeats()">Kaydet ve Word indir</button>' +
        (saved || '<p style="color:#fff;">Henüz kayıtlı oturma planı yok.</p>'),
        '', 'rehber-seat');
    fillSeatBranches();
}
function fillSeatBranches() {
    window._seatPicks = Array(24).fill('');
    var gradeEl = document.getElementById('seat-grade');
    var sel = document.getElementById('seat-branch');
    if (!gradeEl || !sel) return;
    var names = Object.keys((typeof fenData !== 'undefined' && fenData[gradeEl.value] && fenData[gradeEl.value].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option>A</option>';
    drawSeats();
}
function resetSeats() {
    window._seatPicks = Array(24).fill('');
    drawSeats();
}
function seatPick(el) {
    window._seatPicks[Number(el.getAttribute('data-i'))] = el.value;
    drawSeats();
}
function drawSeats() {
    var board = document.getElementById('seat-board');
    var gradeEl = document.getElementById('seat-grade');
    if (!board || !gradeEl) return;
    var students = officeStudents(gradeEl.value, document.getElementById('seat-branch').value);
    var picks = window._seatPicks || Array(24).fill('');
    var used = {};
    picks.forEach(function(value) { if (value) used[value] = true; });
    function options(current) {
        return '<option value=""></option>' + students.map(function(student) {
            var value = student.no + ' ' + student.name;
            if (used[value] && value !== current) return '';
            return '<option' + (value === current ? ' selected' : '') + '>' + officeEsc(value) + '</option>';
        }).join('');
    }
    var columns = '';
    for (var col = 0; col < 3; col++) {
        var desks = '';
        for (var row = 0; row < 4; row++) {
            var base = (col * 4 + row) * 2;
            desks += '<div style="border:2px solid #1f2937;border-radius:10px;padding:6px;margin-bottom:8px;background:#fff;">' +
                '<select class="seat-cell auth-input" data-i="' + base + '" onchange="seatPick(this)" style="margin:0 0 6px;">' + options(picks[base]) + '</select>' +
                '<select class="seat-cell auth-input" data-i="' + (base + 1) + '" onchange="seatPick(this)" style="margin:0;">' + options(picks[base + 1]) + '</select></div>';
        }
        columns += '<div>' + desks + '</div>';
    }
    board.innerHTML = '<div style="background:#fff;border-radius:16px;padding:14px;margin:12px 0;">' +
        '<div style="display:flex;gap:12px;align-items:stretch;margin-bottom:14px;flex-wrap:wrap;">' +
        '<div style="width:150px;min-height:72px;border:3px solid #9a3412;border-radius:10px;display:flex;align-items:center;justify-content:center;text-align:center;color:#9a3412;font-weight:700;padding:8px;">ÖĞRETMEN MASASI</div>' +
        '<div style="flex:1;min-width:180px;background:#1f2937;color:#fff;text-align:center;font-weight:700;padding:16px;border-radius:8px;">YAZI TAHTASI</div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' + columns + '</div></div>';
}
function saveSeats() {
    if (!window.fflate) return alert('Sayfayı yenile.');
    var grade = document.getElementById('seat-grade').value;
    var branch = document.getElementById('seat-branch').value;
    var info = rehberInfo(grade, branch, '', '');
    var picks = window._seatPicks || [];
    var body = docxP(info.year || '', { align: 'center', bold: true, size: 28 }) +
        docxP(info.school || '', { align: 'center', bold: true, size: 26 }) +
        docxP(grade + '/' + branch + ' SINIFI OTURMA PLANI', { align: 'center', bold: true, size: 28, after: 200 });
    body += '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="400"/><w:gridCol w:w="6800"/></w:tblGrid></w:tblPr><w:tr>' +
        docxCell(docxP('ÖĞRETMEN MASASI', { align: 'center', bold: true, size: 18, color: '9A3412', after: 40 }) +
            docxP(info.teacher || '', { align: 'center', bold: true, size: 18, after: 0 }), { w: 2200, fill: 'FFF7ED' }) +
        docxGap() +
        docxCell(docxP('YAZI TAHTASI', { align: 'center', bold: true, size: 28, color: 'FFFFFF', after: 0 }), { w: 6800, fill: '1F2937' }) +
        '</w:tr></w:tbl>' + docxP(' ', { after: 120 });
    var rows = '';
    for (var row = 0; row < 4; row++) {
        var cells = '';
        for (var col = 0; col < 3; col++) {
            var base = (col * 4 + row) * 2;
            var first = (picks[base] || '').replace(/^\d+\s+/, '');
            var second = (picks[base + 1] || '').replace(/^\d+\s+/, '');
            if (col) cells += docxGap();
            cells += docxCell(
                docxP(first || ' ', { align: 'center', bold: true, size: 20, after: 40 }) +
                docxP(second || ' ', { align: 'center', bold: true, size: 20, after: 40 }),
                { w: 2800 });
        }
        rows += '<w:tr>' + cells + '</w:tr>';
    }
    body += '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>' + rows + '</w:tbl>';
    body += docxP(' ', { after: 400 }) + docxP(' ', { after: 400 }) + docxP(' ', { after: 200 });
    body += docxP(grade + '/' + branch + ' Sınıf Rehber Öğretmeni', { align: 'center', size: 20 }) +
        docxP(info.teacher || '', { align: 'center', bold: true, size: 22 });
    var bytes = docxPack(body);
    rehberStore('oturma', grade + '/' + branch + ' Oturma Planı', bytes).then(function() {
        window._skipHistory = true;
        openRehberSeat();
        window._skipHistory = false;
    });
}
function voteState() {
    if (!window._voteRows) window._voteRows = { head: [{ who: '', vote: '' }], vice: [{ who: '', vote: '' }], rep: [{ who: '', vote: '' }] };
    return window._voteRows;
}
function voteCapture() {
    var state = voteState();
    if (!document.getElementById('vote-grade')) return state;
    window._voteForm = {
        grade: document.getElementById('vote-grade').value,
        branch: document.getElementById('vote-branch').value,
        date: document.getElementById('vote-date').value
    };
    ['head', 'vice', 'rep'].forEach(function(key) {
        var whos = document.querySelectorAll('.vote-who-' + key);
        var votes = document.querySelectorAll('.vote-oy-' + key);
        state[key] = Array.prototype.map.call(whos, function(el, index) {
            return { who: el.value, vote: votes[index] ? votes[index].value : '' };
        });
        if (!state[key].length) state[key] = [{ who: '', vote: '' }];
    });
    return state;
}
function voteAdd(key) {
    voteCapture();
    voteState()[key].push({ who: '', vote: '' });
    openRehberVote();
}
function voteDrop(key, index) {
    voteCapture();
    var rows = voteState()[key];
    rows.splice(index, 1);
    if (!rows.length) rows.push({ who: '', vote: '' });
    openRehberVote();
}
function openRehberVote() {
    var form = window._voteForm || {};
    var state = voteState();
    var grade = form.grade || '5';
    var students = [];
    function block(key, title) {
        var used = {};
        ['head', 'vice', 'rep'].forEach(function(group) {
            state[group].forEach(function(row) { if (row.who) used[row.who] = true; });
        });
        var lines = state[key].map(function(row, index) {
            var options = '<option value=""></option>' + students.map(function(student) {
                var value = student.no + '\t' + student.name;
                if (used[value] && value !== row.who) return '';
                return '<option value="' + officeEsc(value) + '"' + (value === row.who ? ' selected' : '') + '>' + officeEsc(student.no + ' ' + student.name) + '</option>';
            }).join('');
            return '<div style="display:flex;gap:8px;align-items:center;">' +
                '<select class="vote-who-' + key + ' auth-input" style="flex:1;" onchange="voteCapture();openRehberVote()">' + options + '</select>' +
                '<input class="vote-oy-' + key + ' auth-input" type="number" min="0" value="' + officeEsc(row.vote) + '" placeholder="Oy" style="width:90px;" onchange="voteCapture()">' +
                '<button class="auth-btn doc-mini" style="background:#b91c1c;margin:0;" onclick="voteDrop(\'' + key + '\',' + index + ')">Sil</button></div>';
        }).join('');
        return '<div style="background:#fff;color:#111;border-radius:14px;padding:12px;margin:10px 0;"><h3 style="margin:0 0 8px;">' + title + '</h3>' + lines +
            '<button class="auth-btn doc-mini" style="margin-top:8px;" onclick="voteAdd(\'' + key + '\')">Öğrenci ekle</button></div>';
    }
    officeShell('Seçim tutanağı',
        '<p style="color:#fff;">Sınıf ve şubeyi seç. Başkan, yardımcı ve temsilci için öğrenci seçip oyunu yaz. Aynı öğrenci iki yerde seçilmez.</p>' +
        '<select id="vote-grade" class="auth-input" onchange="voteCapture();window._voteForm.grade=this.value;openRehberVote()">' + rehberGradeOptions() + '</select>' +
        '<select id="vote-branch" class="auth-input" onchange="voteCapture();openRehberVote()"></select>' +
        '<input id="vote-date" type="date" class="auth-input" value="' + officeEsc(form.date || '') + '">' +
        '<div id="vote-blocks"></div>' +
        '<button class="auth-btn" onclick="saveVote()">Oluştur ve Word indir</button>' +
        (rehberSavedHtml('secim') || '<p style="color:#fff;">Henüz kayıtlı tutanak yok.</p>'),
        '', 'rehber-vote');
    var gradeEl = document.getElementById('vote-grade');
    if (gradeEl) gradeEl.value = grade;
    fillRehberBranches('vote-grade', 'vote-branch');
    var branchEl = document.getElementById('vote-branch');
    if (branchEl && form.branch) branchEl.value = form.branch;
    students = officeStudents(gradeEl.value, branchEl.value);
    document.getElementById('vote-blocks').innerHTML = block('head', 'Sınıf başkanı') + block('vice', 'Sınıf başkan yardımcısı') + block('rep', 'Sınıf temsilcisi');
    var dateEl = document.getElementById('vote-date');
    if (dateEl && form.date) dateEl.value = form.date;
}
function votePeople(rows) {
    return (rows || []).map(function(row) {
        var parts = String(row.who || '').split('\t');
        return { no: parts[0] || '', name: parts.slice(1).join('\t') || '', vote: row.vote || '' };
    }).filter(function(row) { return row.name; });
}
function voteWinner(rows) {
    var best = null;
    rows.forEach(function(row) {
        var vote = parseInt(row.vote, 10) || 0;
        if (!best || vote > best.vote) best = { name: row.name, no: row.no, vote: vote };
    });
    return best;
}
function voteTable(rows) {
    var head = '<w:tr>' +
        docxCell(docxP('S.No', { align: 'center', bold: true, size: 18, after: 0 }), { w: 700, fill: 'FFEDD5' }) +
        docxCell(docxP('Adı Soyadı', { align: 'center', bold: true, size: 18, after: 0 }), { w: 3600, fill: 'FFEDD5' }) +
        docxCell(docxP('Numarası', { align: 'center', bold: true, size: 18, after: 0 }), { w: 1400, fill: 'FFEDD5' }) +
        docxCell(docxP('Aldığı Oy', { align: 'center', bold: true, size: 18, after: 0 }), { w: 1400, fill: 'FFEDD5' }) +
        docxCell(docxP('Yazıyla', { align: 'center', bold: true, size: 18, after: 0 }), { w: 1800, fill: 'FFEDD5' }) +
        '</w:tr>';
    var body = rows.map(function(row, index) {
        return '<w:tr>' +
            docxCell(docxP(String(index + 1), { align: 'center', size: 20, after: 0 }), { w: 700 }) +
            docxCell(docxP(row.name, { align: 'left', size: 20, after: 0 }), { w: 3600 }) +
            docxCell(docxP(row.no, { align: 'center', size: 20, after: 0 }), { w: 1400 }) +
            docxCell(docxP(String(row.vote || ''), { align: 'center', size: 20, after: 0 }), { w: 1400 }) +
            docxCell(docxP(trVoteWords(row.vote), { align: 'center', size: 20, after: 0 }), { w: 1800 }) +
            '</w:tr>';
    }).join('');
    if (!body) body = '<w:tr>' + docxCell(docxP(' ', { after: 0 }), { w: 700 }) + docxCell(docxP(' ', { after: 0 }), { w: 3600 }) + docxCell(docxP(' ', { after: 0 }), { w: 1400 }) + docxCell(docxP(' ', { after: 0 }), { w: 1400 }) + docxCell(docxP(' ', { after: 0 }), { w: 1800 }) + '</w:tr>';
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>' + head + body + '</w:tbl>';
}
function saveVote() {
    if (!window.fflate) return alert('Sayfayı yenile.');
    var state = voteCapture();
    var grade = document.getElementById('vote-grade').value;
    var branch = document.getElementById('vote-branch').value;
    var info = rehberInfo(grade, branch, document.getElementById('vote-date').value, '');
    var heads = votePeople(state.head);
    var vices = votePeople(state.vice);
    var reps = votePeople(state.rep);
    if (!heads.length && !vices.length && !reps.length) return alert('En az bir öğrenci seç.');
    var klass = grade + '/' + branch;
    var headWin = voteWinner(heads);
    var viceWin = voteWinner(vices);
    var repWin = voteWinner(reps);
    var result = 'Okulumuz ' + klass + ' sınıfı öğrencileri arasında yapılan oylama sonucunda ';
    var bits = [];
    if (headWin) bits.push(headWin.vote + ' oyla ' + headWin.name + ' sınıf başkanı');
    if (viceWin) bits.push(viceWin.vote + ' oyla ' + viceWin.name + ' sınıf başkan yardımcısı');
    result += bits.join(', ') + ' seçilmiştir.';
    var repText = repWin ? ('Okulumuz ' + klass + ' sınıfı öğrencileri arasında sınıf temsilcisi olarak ' + (repWin.vote ? repWin.vote + ' oyla ' : '') + repWin.name + ' seçilmiştir.') : '';
    function cover(title, intro, table, closing) {
        return docxP(info.year || '', { align: 'center', bold: true, size: 28 }) +
            docxP((info.school || '') + ' MÜDÜRLÜĞÜ', { align: 'center', bold: true, size: 26 }) +
            docxP(title, { align: 'center', bold: true, size: 28, after: 200 }) +
            docxP(intro, { size: 22, after: 160 }) +
            table +
            docxP(closing, { size: 22, after: 200 }) +
            docxP(' ', { after: 280 }) +
            docxP(info.date || '', { align: 'right', size: 22 }) +
            docxP(info.teacher || '', { align: 'right', bold: true, size: 22, after: 0 }) +
            docxP('Sınıf Rehber Öğretmeni', { align: 'right', bold: true, size: 22 });
    }
    var body = '';
    if (heads.length || vices.length) {
        body += cover('SINIF BAŞKANI VE BAŞKAN YARDIMCISI SEÇİM TUTANAĞI',
            'Okulumuz ' + klass + ' sınıfı öğrencileri arasında sınıf başkanı seçimi yapılmıştır. Oyların sayımı yapılarak, oy dökümü aşağıya çıkarılmıştır.',
            voteTable(heads.concat(vices)),
            bits.length ? result : '');
    }
    if (reps.length) {
        if (body) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        body += cover('SINIF TEMSİLCİSİ SEÇİM TUTANAĞI',
            'Okulumuz ' + klass + ' sınıfı öğrencileri arasında sınıf temsilcisi seçimi yapılmıştır. Oyların sayımı yapılarak, oy dökümü aşağıya çıkarılmıştır.',
            voteTable(reps),
            repText);
    }
    var bytes = docxPack(body);
    rehberStore('secim', klass + ' Seçim Tutanağı', bytes).then(function() {
        window._skipHistory = true;
        openRehberVote();
        window._skipHistory = false;
    });
}
function dutyMonths() {
    return [
        { n: 9, name: 'Eylül' }, { n: 10, name: 'Ekim' }, { n: 11, name: 'Kasım' }, { n: 12, name: 'Aralık' },
        { n: 1, name: 'Ocak' }, { n: 2, name: 'Şubat' }, { n: 3, name: 'Mart' }, { n: 4, name: 'Nisan' },
        { n: 5, name: 'Mayıs' }, { n: 6, name: 'Haziran' }
    ];
}
function dutyMonthOrder(month) {
    month = parseInt(month, 10);
    return month >= 9 ? month - 9 : month + 3;
}
function dutyYearOptions() {
    var year = typeof currentPortalYear === 'function' ? (currentPortalYear() || '') : '';
    var start = parseInt(year, 10) || new Date().getFullYear();
    var html = '';
    for (var y = start - 1; y <= start + 8; y++) {
        var label = y + '-' + (y + 1);
        html += '<option' + (label === year ? ' selected' : '') + '>' + label + '</option>';
    }
    return html;
}
function dutyCapture() {
    if (!document.getElementById('duty-year')) return;
    window._dutyForm = {
        year: document.getElementById('duty-year').value,
        month: document.getElementById('duty-month').value,
        grade: document.getElementById('duty-grade').value,
        branch: document.getElementById('duty-branch').value
    };
}
function dutyPlans(year, grade, branch) {
    return (officeBag().rehberSaved || []).filter(function(item) {
        return item.kind === 'nobet' && item.year === year && String(item.grade) === String(grade) && item.branch === branch;
    });
}
function dutyStartIndex(year, grade, branch, month) {
    var order = dutyMonthOrder(month);
    var priors = dutyPlans(year, grade, branch).filter(function(item) { return dutyMonthOrder(item.month) < order; });
    if (!priors.length) return 0;
    priors.sort(function(a, b) { return dutyMonthOrder(b.month) - dutyMonthOrder(a.month); });
    return priors[0].nextIndex || 0;
}
function dutyCalendar(yearLabel, month, holidays) {
    var start = parseInt(yearLabel, 10) || new Date().getFullYear();
    var year = month >= 9 ? start : start + 1;
    var names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    var last = new Date(year, month, 0).getDate();
    var map = {};
    (holidays || []).forEach(function(item) { if (item.date) map[item.date] = item.name || 'Resmi tatil'; });
    var days = [];
    for (var day = 1; day <= last; day++) {
        var date = new Date(year, month - 1, day);
        var week = date.getDay();
        if (week === 0 || week === 6) continue;
        var iso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        days.push({ iso: iso, label: String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year, weekday: names[week], holiday: map[iso] || '' });
    }
    return days;
}
function openRehberDuty() {
    var form = window._dutyForm || {};
    var year = form.year || (typeof currentPortalYear === 'function' ? currentPortalYear() : '') || '';
    officeShell('Nöbet listesi',
        '<p style="color:#fff;">Ayı seç. Kayıtlı bir önceki ayın bittiği öğrenciden devam eder. Liste bitince başa döner. Tatil gününe öğrenci yazılmaz. Yıllar, kaydettiğin eğitim yılına göre uzar. Yeni yıl yazınca listede o da çıkar; öğretmeni silmene gerek yok.</p>' +
        '<select id="duty-year" class="auth-input" onchange="dutyCapture();openRehberDuty()">' + dutyYearOptions() + '</select>' +
        '<select id="duty-month" class="auth-input" onchange="dutyCapture();openRehberDuty()">' + dutyMonths().map(function(item) {
            return '<option value="' + item.n + '">' + item.name + '</option>';
        }).join('') + '</select>' +
        '<select id="duty-grade" class="auth-input" onchange="dutyCapture();window._dutyForm.grade=this.value;openRehberDuty()">' + rehberGradeOptions() + '</select>' +
        '<select id="duty-branch" class="auth-input" onchange="dutyCapture();openRehberDuty()"></select>' +
        '<div id="duty-preview" style="color:#fff;margin:8px 0;"></div>' +
        '<div style="background:#fff;color:#111;border-radius:14px;padding:12px;margin:10px 0;">' +
        '<h3 style="margin:0 0 8px;">Resmi tatil</h3>' +
        '<input id="duty-hdate" type="date" class="auth-input">' +
        '<input id="duty-hname" class="auth-input" placeholder="Örn. Cumhuriyet Bayramı">' +
        '<button class="auth-btn doc-mini" onclick="saveDutyHoliday()">Tatili kaydet</button>' +
        '<div id="duty-holidays"></div></div>' +
        '<button class="auth-btn" onclick="saveDuty()">Oluştur ve Word indir</button>' +
        '<div id="duty-saved"></div>',
        '', 'rehber-duty');
    var yearEl = document.getElementById('duty-year');
    if (yearEl && year) yearEl.value = year;
    var monthEl = document.getElementById('duty-month');
    if (monthEl && form.month) monthEl.value = form.month;
    var gradeEl = document.getElementById('duty-grade');
    if (gradeEl && form.grade) gradeEl.value = form.grade;
    fillRehberBranches('duty-grade', 'duty-branch');
    var branchEl = document.getElementById('duty-branch');
    if (branchEl && form.branch) branchEl.value = form.branch;
    var pickedYear = yearEl.value;
    var holidays = (officeBag().dutyHolidays || []).filter(function(item) { return item.year === pickedYear; });
    document.getElementById('duty-holidays').innerHTML = holidays.length ? holidays.sort(function(a, b) { return a.date < b.date ? -1 : 1; }).map(function(item) {
        var shown = item.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
        return '<p style="margin:8px 0;">' + officeEsc(shown + ' ' + (item.name || '')) + ' <button class="auth-btn doc-mini" style="background:#b91c1c;margin:0;" onclick="deleteDutyHoliday(\'' + item.id + '\')">Sil</button></p>';
    }).join('') : '<p>Bu yıl kayıtlı tatil yok.</p>';
    var students = officeStudents(gradeEl.value, branchEl.value);
    var start = dutyStartIndex(pickedYear, gradeEl.value, branchEl.value, monthEl.value);
    var starter = students.length ? students[start % students.length] : null;
    document.getElementById('duty-preview').textContent = starter
        ? ('Bu ay ' + (starter.no + ' ' + starter.name) + ' öğrencisinden başlar. ' + students.length + ' öğrenci var.')
        : 'Bu şubede öğrenci yok.';
    var saved = rehberSavedHtml('nobet');
    document.getElementById('duty-saved').innerHTML = saved || '<p style="color:#fff;">Henüz kayıtlı nöbet listesi yok.</p>';
}
function saveDutyHoliday() {
    dutyCapture();
    var date = document.getElementById('duty-hdate').value;
    var name = (document.getElementById('duty-hname').value || '').trim() || 'Resmi tatil';
    if (!date) return alert('Tatil tarihini seç.');
    var bag = officeBag();
    bag.dutyHolidays = bag.dutyHolidays || [];
    bag.dutyHolidays.push({ id: 'h' + Date.now(), year: window._dutyForm.year, date: date, name: name });
    officeWrite(bag);
    window._skipHistory = true;
    openRehberDuty();
    window._skipHistory = false;
}
function deleteDutyHoliday(id) {
    dutyCapture();
    var bag = officeBag();
    bag.dutyHolidays = (bag.dutyHolidays || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    window._skipHistory = true;
    openRehberDuty();
    window._skipHistory = false;
}
function saveDuty() {
    if (!window.fflate) return alert('Sayfayı yenile.');
    dutyCapture();
    var year = document.getElementById('duty-year').value;
    var month = parseInt(document.getElementById('duty-month').value, 10);
    var grade = document.getElementById('duty-grade').value;
    var branch = document.getElementById('duty-branch').value;
    var students = officeStudents(grade, branch);
    if (!students.length) return alert('Bu şubede öğrenci yok.');
    var monthName = (dutyMonths().filter(function(item) { return item.n === month; })[0] || {}).name || '';
    var holidays = (officeBag().dutyHolidays || []).filter(function(item) { return item.year === year; });
    var days = dutyCalendar(year, month, holidays);
    var start = dutyStartIndex(year, grade, branch, month);
    var cursor = start;
    days.forEach(function(day) {
        if (day.holiday) {
            day.who = day.holiday;
            return;
        }
        var student = students[cursor % students.length];
        day.who = student.no + ' ' + student.name;
        cursor += 1;
    });
    var nextIndex = cursor % students.length;
    var info = rehberInfo(grade, branch, '', '');
    var assigned = days.filter(function(day) { return !day.holiday; }).length;
    var head = '<w:tr>' +
        docxCell(docxP('Tarih', { align: 'center', bold: true, size: 20, after: 0 }), { w: 2200, fill: 'FFEDD5' }) +
        docxCell(docxP('Gün', { align: 'center', bold: true, size: 20, after: 0 }), { w: 2200, fill: 'FFEDD5' }) +
        docxCell(docxP('Nöbetçi öğrenci', { align: 'center', bold: true, size: 20, after: 0 }), { w: 4600, fill: 'FFEDD5' }) +
        '</w:tr>';
    var table = days.map(function(day) {
        var fill = day.holiday ? 'FEE2E2' : '';
        return '<w:tr>' +
            docxCell(docxP(day.label, { align: 'center', size: 20, after: 0 }), { w: 2200, fill: fill }) +
            docxCell(docxP(day.weekday, { align: 'center', size: 20, after: 0 }), { w: 2200, fill: fill }) +
            docxCell(docxP(day.who, { align: 'left', bold: !!day.holiday, size: 20, after: 0 }), { w: 4600, fill: fill }) +
            '</w:tr>';
    }).join('');
    var nextStudent = students[nextIndex];
    var body = docxP((info.year || year) + ' EĞİTİM-ÖĞRETİM YILI', { align: 'center', bold: true, size: 28 }) +
        docxP(info.school || '', { align: 'center', bold: true, size: 26 }) +
        docxP(grade + '/' + branch + ' SINIFI ' + monthName.toLocaleUpperCase('tr-TR') + ' NÖBET LİSTESİ', { align: 'center', bold: true, size: 28, after: 200 }) +
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>' + head + table + '</w:tbl>' +
        docxP('Bu ay ' + assigned + ' nöbet günü yazıldı. Sonraki ay ' + nextStudent.no + ' ' + nextStudent.name + ' öğrencisinden devam eder.', { size: 20, after: 200 }) +
        docxP(' ', { after: 280 }) +
        docxP(info.teacher || '', { align: 'right', bold: true, size: 22, after: 0 }) +
        docxP('Sınıf Rehber Öğretmeni', { align: 'right', bold: true, size: 22 });
    var bytes = docxPack(body);
    var bag = officeBag();
    var olds = (bag.rehberSaved || []).filter(function(item) {
        return item.kind === 'nobet' && item.year === year && String(item.grade) === String(grade) && item.branch === branch && parseInt(item.month, 10) === month;
    });
    bag.rehberSaved = (bag.rehberSaved || []).filter(function(item) { return olds.indexOf(item) < 0; });
    officeWrite(bag);
    Promise.all(olds.map(function(item) { return officeFileDel('rehber-doc-' + item.id); })).then(function() {
        return rehberStore('nobet', grade + '/' + branch + ' ' + monthName + ' Nöbet Listesi', bytes, {
            year: year, grade: grade, branch: branch, month: month, nextIndex: nextIndex
        });
    }).then(function() {
        var later = dutyPlans(year, grade, branch).filter(function(item) { return dutyMonthOrder(item.month) > dutyMonthOrder(month); });
        if (later.length) alert('Bu ay yenilendi. Sonraki ayları da yeniden oluştur; sıra kaymasın.');
        window._skipHistory = true;
        openRehberDuty();
        window._skipHistory = false;
    });
}

function kulupTypes() {
    return [
        { id: 'yonetmelik', name: 'Yönetmelik' },
        { id: 'yillik', name: 'Yıllık plan' },
        { id: 'aylik', name: 'Aylık rapor' },
        { id: 'donem', name: 'Dönem sonu' },
        { id: 'yilsonu', name: 'Yıl sonu' }
    ];
}
function kulupTypeName(id) {
    var hit = kulupTypes().filter(function(item) { return item.id === id; })[0];
    return hit ? hit.name : id;
}
function kulupRoles() {
    return [
        ['baskan', 'Başkan'],
        ['yardimci', 'Başkan Yardımcısı'],
        ['sekreter', 'Sekreter'],
        ['sayman', 'Sayman'],
        ['yonetim', 'Yönetim Kurulu'],
        ['denetim', 'Denetim Kurulu'],
        ['yazi', 'Yazı İnceleme Komisyonu'],
        ['pano', 'Pano Hazırlama Komisyonu']
    ];
}
function openKulup() {
    officeShell('Kulüpler', officeCards([
        { title: 'Ekle', text: 'Taslak yükle', click: "openEvrakScreen('kulup-up')" },
        { title: 'Oluştur', text: 'Üye, görev, ay', click: "openEvrakScreen('kulup-build')" },
        { title: 'Kayıtlı', text: 'Word indir', click: "openEvrakScreen('kulup-saved')" }
    ]), '', 'kulup');
}
function openKulupUpload() {
    var bag = officeBag();
    var saved = bag.kulupTpl || {};
    var cards = kulupTypes().map(function(item) {
        var info = saved[item.id];
        if (!info) return '';
        return '<div class="grade-card" style="cursor:default;"><button class="auth-btn" style="margin:0 0 8px;background:#b91c1c;" onclick="deleteKulupTpl(\'' + item.id + '\')">Sil</button><h3>' + officeEsc(item.name) + '</h3><p>' + officeEsc(info.name || 'Word') + '</p><p>' + officeEsc(info.when || '') + '</p></div>';
    }).join('');
    officeShell('Kulüp taslağı ekle',
        '<p style="color:#fff;">Türü seçip Word taslağını yükle. Aynı tür yeniden yüklenirse eskisinin yerine geçer.</p>' +
        '<select id="kulup-up-type" class="auth-input">' + kulupTypes().map(function(item) {
            return '<option value="' + item.id + '">' + item.name + '</option>';
        }).join('') + '</select>' +
        '<input id="kulup-up-file" type="file" accept=".docx" class="auth-input">' +
        '<button class="auth-btn" onclick="saveKulupTpl()">Yükle</button>' +
        (cards ? '<div class="grade-cards-grid">' + cards + '</div>' : '<p style="color:#fff;">Henüz taslak yok.</p>'),
        '', 'kulup-up');
}
function saveKulupTpl() {
    var type = document.getElementById('kulup-up-type').value;
    var file = document.getElementById('kulup-up-file').files[0];
    if (!file) return alert('Word dosyası seç.');
    if (!/\.docx$/i.test(file.name)) return alert('Dosyayı .docx olarak kaydedip yükle.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('kulup-tpl-' + type, reader.result).then(function() {
            var bag = officeBag();
            bag.kulupTpl = bag.kulupTpl || {};
            bag.kulupTpl[type] = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            window._skipHistory = true;
            openKulupUpload();
            window._skipHistory = false;
        });
    };
    reader.readAsArrayBuffer(file);
}
function deleteKulupTpl(type) {
    if (!confirm(kulupTypeName(type) + ' taslağı silinsin mi?')) return;
    var bag = officeBag();
    if (bag.kulupTpl) delete bag.kulupTpl[type];
    officeWrite(bag);
    officeFileDel('kulup-tpl-' + type).then(function() {
        window._skipHistory = true;
        openKulupUpload();
        window._skipHistory = false;
    });
}
function kulupRefresh() {
    var place = document.getElementById('kulup-place');
    var time = document.getElementById('kulup-time');
    var date = document.getElementById('kulup-date');
    if (place) window._kulupPlace = place.value;
    if (time) window._kulupTime = time.value;
    if (date) window._kulupDate = date.value;
    var advisor = document.getElementById('kulup-advisor');
    if (advisor) {
        window._kulupAdvisor = advisor.value;
        var bag = officeBag();
        bag.kulupAdvisor = advisor.value.trim();
        officeWrite(bag);
    }
    window._skipHistory = true;
    openKulupBuild();
    window._skipHistory = false;
}
function openKulupBuild() {
    var bag = officeBag();
    var saved = bag.kulupTpl || {};
    var ready = kulupTypes().filter(function(item) { return saved[item.id]; });
    if (!ready.length) {
        officeShell('Kulüp oluştur', '<p style="color:#fff;">Önce Ekle kartından taslak yükle.</p>', '', 'kulup-build');
        return;
    }
    var type = window._kulupType && saved[window._kulupType] ? window._kulupType : ready[0].id;
    window._kulupType = type;
    var members = bag.kulupMembers || [];
    var roles = bag.kulupRoles || {};
    var grade = window._kulupGrade || '5';
    var students = [];
    var memberHtml = members.map(function(item, index) {
        return '<p style="margin:6px 0;">' + officeEsc(item.grade + '/' + item.branch + ' ' + item.no + ' ' + item.name) +
            ' <button class="auth-btn" style="background:#b91c1c;margin:0;" onclick="deleteKulupMember(' + index + ')">Sil</button></p>';
    }).join('') || '<p>Henüz üye yok.</p>';
    var roleHtml = '';
    if (type === 'yonetmelik') {
        var options = '<option value="">Seç</option>' + members.map(function(item) {
            var value = [item.grade, item.branch, item.no, item.name].join('\t');
            return '<option value="' + officeEsc(value) + '">' + officeEsc(item.no + ' ' + item.name) + '</option>';
        }).join('');
        roleHtml = '<div style="background:#fff;color:#111;border-radius:14px;padding:12px;margin:10px 0;"><h3 style="margin:0 0 8px;">Görevler</h3>' +
            kulupRoles().map(function(role) {
                var current = roles[role[0]] || '';
                var opts = options.replace('value="' + officeEsc(current) + '"', 'value="' + officeEsc(current) + '" selected');
                return '<label>' + role[1] + '</label><select data-role="' + role[0] + '" class="auth-input">' + opts + '</select>';
            }).join('') + '</div>';
    }
    var monthHtml = (type === 'aylik')
        ? '<select id="kulup-month" class="auth-input">' + dutyMonths().map(function(item) {
            return '<option value="' + item.name + '"' + (window._kulupMonth === item.name ? ' selected' : '') + '>' + item.name + '</option>';
        }).join('') + '</select>'
        : '<input id="kulup-month" type="hidden" value="">';
    var memberBox = type === 'yonetmelik'
        ? '<div style="background:#fff;color:#111;border-radius:14px;padding:12px;margin:10px 0;"><h3 style="margin:0 0 8px;">Kulüp üyeleri</h3>' +
            '<select id="kulup-grade" class="auth-input" onchange="window._kulupGrade=this.value;kulupRefresh()">' + rehberGradeOptions() + '</select>' +
            '<select id="kulup-branch" class="auth-input" onchange="window._kulupBranch=this.value;kulupRefresh()"></select>' +
            '<div id="kulup-students"></div>' +
            '<button class="auth-btn" onclick="addKulupMembers()">Seçilenleri kulübe ekle</button>' +
            memberHtml + '</div>' + roleHtml +
            '<input id="kulup-place" class="auth-input" placeholder="Toplantı yeri, örn. 7/A veya fen laboratuvarı" value="' + officeEsc(window._kulupPlace || '') + '">' +
            '<input id="kulup-time" class="auth-input" placeholder="Saat, örn. 11:55" value="' + officeEsc(window._kulupTime || '') + '">' +
            '<input id="kulup-advisor" class="auth-input" placeholder="Kulüp danışman öğretmeni" value="' + officeEsc(window._kulupAdvisor || (officeBag().kulupAdvisor || '')) + '">'
        : '';
    officeShell('Kulüp oluştur',
        '<p style="color:#fff;">Yüklediğin taslağı seç. Yönetmelikte üye ve görev yazılır. Aylık raporda yıllık plandaki ayın etkinlikleri tabloya gelir. Okul, yıl, öğretmen ve müdür güncellenir.</p>' +
        '<select id="kulup-tpl" class="auth-input" onchange="window._kulupDate=document.getElementById(\'kulup-date\').value;window._kulupMonth=document.getElementById(\'kulup-month\')?document.getElementById(\'kulup-month\').value:\'\';window._kulupType=this.value;kulupRefresh()">' + ready.map(function(item) {
            return '<option value="' + item.id + '"' + (item.id === type ? ' selected' : '') + '>' + item.name + '</option>';
        }).join('') + '</select>' +
        monthHtml +
        '<input id="kulup-date" type="date" class="auth-input" value="' + officeEsc(window._kulupDate || '') + '">' +
        memberBox +
        '<button class="auth-btn" onclick="buildKulup()">Oluştur ve Word indir</button>',
        '', 'kulup-build');
    var gradeEl = document.getElementById('kulup-grade');
    if (gradeEl) {
        gradeEl.value = grade;
        fillRehberBranches('kulup-grade', 'kulup-branch');
        var branchEl = document.getElementById('kulup-branch');
        if (branchEl && window._kulupBranch) branchEl.value = window._kulupBranch;
        students = officeStudents(gradeEl.value, branchEl.value);
        var taken = {};
        members.forEach(function(item) { taken[item.grade + '/' + item.branch + '/' + item.no] = true; });
        document.getElementById('kulup-students').innerHTML = students.map(function(student) {
            var key = gradeEl.value + '/' + branchEl.value + '/' + student.no;
            if (taken[key]) return '<p style="margin:4px 0;color:#9a3412;">' + officeEsc(student.no + ' ' + student.name) + ' eklendi</p>';
            return '<label style="display:block;margin:4px 0;"><input type="checkbox" class="kulup-stu" value="' + officeEsc(student.no + '\t' + student.name) + '"> ' + officeEsc(student.no + ' ' + student.name) + '</label>';
        }).join('') || '<p>Bu şubede öğrenci yok.</p>';
    }
    if (type === 'yonetmelik') {
        document.querySelectorAll('[data-role]').forEach(function(sel) {
            if (roles[sel.getAttribute('data-role')]) sel.value = roles[sel.getAttribute('data-role')];
        });
    }
}
function addKulupMembers() {
    var grade = document.getElementById('kulup-grade').value;
    var branch = document.getElementById('kulup-branch').value;
    window._kulupGrade = grade;
    window._kulupBranch = branch;
    window._kulupDate = document.getElementById('kulup-date').value;
    var bag = officeBag();
    bag.kulupMembers = bag.kulupMembers || [];
    Array.prototype.forEach.call(document.querySelectorAll('.kulup-stu:checked'), function(box) {
        var parts = box.value.split('\t');
        var exists = bag.kulupMembers.some(function(item) {
            return item.grade === grade && item.branch === branch && item.no === parts[0];
        });
        if (!exists) bag.kulupMembers.push({ grade: grade, branch: branch, no: parts[0], name: parts.slice(1).join('\t') });
    });
    officeWrite(bag);
    kulupRefresh();
}
function deleteKulupMember(index) {
    if (document.getElementById('kulup-date')) window._kulupDate = document.getElementById('kulup-date').value;
    var bag = officeBag();
    var gone = (bag.kulupMembers || [])[index];
    bag.kulupMembers = (bag.kulupMembers || []).filter(function(_, i) { return i !== index; });
    if (gone && bag.kulupRoles) {
        var token = [gone.grade, gone.branch, gone.no, gone.name].join('\t');
        Object.keys(bag.kulupRoles).forEach(function(key) { if (bag.kulupRoles[key] === token) delete bag.kulupRoles[key]; });
    }
    officeWrite(bag);
    kulupRefresh();
}
function kulupReadRoles() {
    var bag = officeBag();
    bag.kulupRoles = bag.kulupRoles || {};
    document.querySelectorAll('[data-role]').forEach(function(sel) { bag.kulupRoles[sel.getAttribute('data-role')] = sel.value; });
    officeWrite(bag);
    return bag.kulupRoles;
}
function kulupParaText(para) {
    return Array.prototype.map.call(para.getElementsByTagName('w:t'), function(node) { return node.textContent || ''; }).join('').replace(/\s+/g, ' ').trim();
}
function kulupSetPara(para, value) {
    var texts = para.getElementsByTagName('w:t');
    if (!texts.length) return;
    texts[0].textContent = value;
    texts[0].setAttribute('xml:space', 'preserve');
    for (var i = 1; i < texts.length; i++) texts[i].textContent = '';
}
function kulupDirect(node, name) {
    var list = [];
    for (var i = 0; i < node.childNodes.length; i++) if (node.childNodes[i].nodeName === name) list.push(node.childNodes[i]);
    return list;
}
function kulupLooksLikeName(value) {
    var text = String(value || '').trim();
    if (!text || text.length > 40 || /\d/.test(text)) return false;
    if (/öğretmen|müdür|kulüp|rapor|eğitim|okul|uygundur/i.test(text)) return false;
    var parts = text.split(/\s+/);
    return parts.length >= 2 && parts.length <= 5;
}
function kulupPatchHeader(doc, info, monthName) {
    var nodes = sokTexts(doc);
    var values = nodes.map(function(node) { return node.textContent || ''; });
    var paras = nodes.map(sokParaOf);
    sokReplaceYears(values, info.year, paras);
    var school = info.school || '';
    for (var i = 0; i < values.length; i++) {
        if (school && /OKULU/i.test(values[i]) && values[i].length < 120) {
            values[i] = values[i].replace(/[.\u2026]{3,}\s*OKULU/gi, school);
            values[i] = values[i].replace(/[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü .]{1,40}(?:ORTAOKULU|İLKOKULU|LİSESİ|OTAOKULU)/g, school);
        }
        if (info.date) values[i] = values[i].replace(/[.\u2026]+\s*\/\s*[.\u2026]+\s*\/\s*[.\u20260-9]+/g, info.date);
        if (monthName && /^\(?\s*(EYLÜL|EKİM|KASIM|ARALIK|OCAK|ŞUBAT|MART|NİSAN|MAYIS|HAZİRAN)\s*\)?$/i.test(values[i].trim())) {
            values[i] = '(' + monthName.toLocaleUpperCase('tr-TR') + ')';
        }
        if (monthName && /Rapor No\s*:/i.test(values[i])) {
            var no = dutyMonths().map(function(item) { return item.name; }).indexOf(monthName) + 1;
            if (no > 0) values[i] = values[i].replace(/Rapor No\s*:\s*\d+/i, 'Rapor No: ' + no);
        }
    }
    if (info.date) sokReplaceDates(values, info.date, paras);
    sokWrite(nodes, values);
    var body = doc.getElementsByTagName('w:body')[0];
    if (!body) return;
    var blocks = kulupDirect(body, 'w:p');
    var advisorName = (officeBag().kulupAdvisor || info.teacher || '').trim();
    blocks.forEach(function(para, index) {
        if (!kulupLooksLikeName(kulupParaText(para))) return;
        for (var next = index + 1; next < blocks.length && next < index + 4; next++) {
            var label = kulupParaText(blocks[next]);
            if (!label || label.length > 45 || /^madde\b/i.test(label)) break;
            if (/Danışman Öğretmen/i.test(label) && advisorName) kulupSetPara(para, advisorName);
            else if (/^Okul Müdürü$/i.test(label) && info.principal) kulupSetPara(para, info.principal);
            break;
        }
    });
    if (school) {
        blocks.forEach(function(para) {
            var text = kulupParaText(para);
            if (!/ÇALIŞMA TAKVİMİ|TOPLUM HİZMETİ ÇALIŞMA/i.test(text) || text.indexOf(school) >= 0) return;
            kulupSetPara(para, school + ' ' + text);
        });
    }
    kulupSealHeader(doc, info, school);
    kulupRefreshFacts(doc, info);
}
function kulupRefreshFacts(doc, info) {
    var date = info && info.date;
    var year = info && info.year;
    if (!date && !year) return;
    Array.prototype.forEach.call(doc.getElementsByTagName('w:p'), function(para) {
        var text = kulupParaText(para);
        if (!text) return;
        var next = text;
        if (date) next = next.replace(/\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/g, date);
        if (year) {
            next = next.replace(/20\d{2}\s*[-–]\s*20\d{2}/g, year);
            next = next.replace(/20\s*[_\u2026.]{2,}\s*[/–-]\s*20\s*[_\u2026.]{2,}/g, year);
            next = next.replace(/[.\u2026]{2,}\s*[-–]\s*[.\u2026]{2,}/g, year);
        }
        if (next !== text) kulupSetPara(para, next);
    });
}
function kulupGrid(doc, rows) {
    var ns = (doc.documentElement && doc.documentElement.namespaceURI) || 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    function node(name) { return doc.createElementNS(ns, name); }
    var table = node('w:tbl');
    var props = node('w:tblPr');
    var width = node('w:tblW');
    width.setAttribute('w:w', '5000');
    width.setAttribute('w:type', 'pct');
    props.appendChild(width);
    var borders = node('w:tblBorders');
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach(function(edge) {
        var border = node('w:' + edge);
        border.setAttribute('w:val', 'nil');
        borders.appendChild(border);
    });
    props.appendChild(borders);
    table.appendChild(props);
    var cols = rows[0] ? rows[0].length : 1;
    var grid = node('w:tblGrid');
    for (var g = 0; g < cols; g++) {
        var col = node('w:gridCol');
        col.setAttribute('w:w', '4500');
        grid.appendChild(col);
    }
    table.appendChild(grid);
    rows.forEach(function(cells) {
        var line = node('w:tr');
        var trPr = node('w:trPr');
        trPr.appendChild(node('w:cantSplit'));
        line.appendChild(trPr);
        cells.forEach(function(value) {
            var cell = node('w:tc');
            var cellProps = node('w:tcPr');
            var cellWidth = node('w:tcW');
            cellWidth.setAttribute('w:w', '4500');
            cellWidth.setAttribute('w:type', 'dxa');
            cellProps.appendChild(cellWidth);
            cell.appendChild(cellProps);
            var para = node('w:p');
            var paraProps = node('w:pPr');
            var align = node('w:jc');
            align.setAttribute('w:val', 'center');
            paraProps.appendChild(align);
            para.appendChild(paraProps);
            var run = node('w:r');
            var runProps = node('w:rPr');
            var size = node('w:sz');
            size.setAttribute('w:val', '20');
            runProps.appendChild(size);
            var text = node('w:t');
            text.textContent = value || '';
            run.appendChild(runProps);
            run.appendChild(text);
            para.appendChild(run);
            cell.appendChild(para);
            line.appendChild(cell);
        });
        table.appendChild(line);
    });
    return table;
}
function officeInTable(node) {
    var cur = node;
    while (cur) {
        var name = cur.nodeName || '';
        if (name === 'w:tbl' || /:tbl$/.test(name)) return true;
        cur = cur.parentNode;
    }
    return false;
}
function kulupFixTail(doc, info) {
    var advisor = (officeBag().kulupAdvisor || (info && info.teacher) || '').trim().toLocaleUpperCase('tr-TR');
    var principal = ((info && info.principal) || '').trim().toLocaleUpperCase('tr-TR');
    var date = (info && info.date) || '';
    var paras = Array.prototype.slice.call(doc.getElementsByTagName('w:p'));
    var jobs = [];
    paras.forEach(function(para, index) {
        var label = kulupParaText(para).replace(/\s+/g, ' ').trim();
        if (!label || label.length > 80 || officeInTable(para)) return;
        if (/Kulüp Danışman Öğretmeni/i.test(label) && /UYGUNDUR/i.test(label)) {
            jobs.push({ para: para, drop: [paras[index - 1], paras[index + 1], paras[index + 2]], rows: [[advisor, date], ['Kulüp Danışman Öğretmeni', 'Uygundur'], ['', principal], ['', 'Okul Müdürü']] });
            return;
        }
        if (/Danışman Öğretmen/i.test(label) && /Okul Müdürü/i.test(label)) {
            jobs.push({ para: para, drop: [], rows: [[advisor, principal], ['Danışman Öğretmen', 'Okul Müdürü']] });
            return;
        }
        var next = paras[index + 1] ? kulupParaText(paras[index + 1]).replace(/\s+/g, ' ').trim() : '';
        if (/^Danışman Öğretmen\b/i.test(label) && next.length < 80 && /Okul Müdürü/i.test(next)) {
            jobs.push({ para: para, drop: [paras[index + 1]], rows: [[advisor, principal], ['Danışman Öğretmen', 'Okul Müdürü']] });
        }
    });
    jobs.forEach(function(job) {
        if (!job.para.parentNode) return;
        job.para.parentNode.insertBefore(kulupGrid(doc, job.rows), job.para);
        job.para.parentNode.removeChild(job.para);
        job.drop.forEach(function(node) {
            if (node && node.parentNode) node.parentNode.removeChild(node);
        });
    });
}
function kulupPutDate(para, date) {
    var nodes = Array.prototype.slice.call(para.getElementsByTagName('w:t'));
    var parts = nodes.map(function(node) { return node.textContent || ''; });
    var joined = parts.join('');
    var match = joined.match(/[.\u2026]+\s*\/\s*[.\u2026]+\s*\/\s*[.\u2026\d.]*/);
    if (!match) return;
    var start = match.index;
    var end = start + match[0].length;
    var pos = 0;
    var wrote = false;
    parts.forEach(function(part, index) {
        var from = pos;
        var to = pos + part.length;
        pos = to;
        if (to <= start || from >= end) return;
        var left = part.slice(0, Math.max(0, start - from));
        var right = part.slice(Math.max(0, end - from));
        nodes[index].textContent = left + (wrote ? '' : date) + right;
        wrote = true;
    });
}
function kulupSealHeader(doc, info, school) {
    var body = doc.getElementsByTagName('w:body')[0];
    if (!body) return;
    var blocks = kulupDirect(body, 'w:p');
    var date = info.date;
    if (!date) {
        var now = new Date();
        date = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
    }
    blocks.forEach(function(para, index) {
        var text = kulupParaText(para);
        if (school && /OKULU/i.test(text) && text.indexOf(school) < 0 && (/YILI|EĞİTİM|MÜDÜRLÜĞ|YATIKSIRT|OTAOKULU|ORTAOKULU/i.test(text) || /[.\u2026]{2,}/.test(text))) {
            var next = text.replace(/[.\u2026.]{2,}\s*(?:ORTAOKULU|OTAOKULU|İLKOKULU|LİSESİ|OKULU)/gi, school);
            next = next.replace(/([A-ZÇĞİÖŞÜ]{2,}(?:\s+[A-ZÇĞİÖŞÜ]{2,}){0,5})\s+(?:ORTAOKULU|OTAOKULU|İLKOKULU|LİSESİ)/g, function(all, words) {
                var parts = words.trim().split(/\s+/);
                var stop = { EĞİTİM: 1, ÖĞRETİM: 1, YILI: 1, YIL: 1 };
                while (parts.length && stop[parts[0]]) parts.shift();
                if (!parts.length) return all;
                var oldName = parts.join(' ');
                return words.slice(0, words.lastIndexOf(oldName)) + school;
            });
            if (info.year) next = next.replace(/[.\u2026]{1,3}\s*[-–]\s*[.\u2026]{1,3}/g, info.year);
            if (next !== text) kulupSetPara(para, next);
        }
        if (/tarih/i.test(text)) kulupPutDate(para, date);
    });
}
function kulupFillMembers(doc, members) {
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        if (!/SIRA NO/.test(sokRowText(table)) || !/OKUL NO/.test(sokRowText(table))) return;
        var rows = kulupDirect(table, 'w:tr');
        if (rows.length < 2 || !members.length) return;
        var proto = rows[1];
        rows.slice(1).forEach(function(row) { table.removeChild(row); });
        members.forEach(function(item, index) {
            var row = proto.cloneNode(true);
            var cells = sokDirectCells(row);
            if (cells[0]) sokSetCell(cells[0], String(index + 1));
            if (cells[1]) sokSetCell(cells[1], item.grade + '/' + item.branch);
            if (cells[2]) sokSetCell(cells[2], item.no);
            if (cells[3]) sokSetCell(cells[3], item.name);
            table.appendChild(row);
        });
    });
}
function kulupFillRoles(doc, roles) {
    var map = {};
    kulupRoles().forEach(function(role) { map[role[1]] = roles[role[0]] || ''; });
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        if (!/Görev/.test(sokRowText(table)) || !/Ad Soyad/.test(sokRowText(table))) return;
        kulupDirect(table, 'w:tr').forEach(function(row) {
            var cells = sokDirectCells(row);
            if (cells.length < 3) return;
            var label = kulupParaText(cells[0]).replace(/\s+/g, ' ').trim();
            var key = label === 'Başkan' ? 'Başkan' : '';
            if (!key) {
                kulupRoles().forEach(function(role) {
                    if (role[1] !== 'Başkan' && label.indexOf(role[1]) === 0) key = role[1];
                });
            }
            if (!key || !map[key]) return;
            var parts = map[key].split('\t');
            sokSetCell(cells[1], (parts[0] || '') + '/' + (parts[1] || ''));
            sokSetCell(cells[2], parts[3] || '');
        });
    });
}
function kulupRoleName(value) {
    var parts = String(value || '').split('\t');
    return parts.length >= 4 ? parts[3] : '';
}
function kulupApplyMeeting(doc, place, time) {
    var body = doc.getElementsByTagName('w:body')[0];
    if (!body) return;
    kulupDirect(body, 'w:p').forEach(function(para) {
        var text = kulupParaText(para);
        if (!/sınıfında/i.test(text) || !/saat/i.test(text)) return;
        var next = text;
        if (place) {
            var room = /\d/.test(place) && place.indexOf('/') >= 0 && !/sınıf/i.test(place) ? place + ' sınıfında' : place;
            next = next.replace(/\d+\s*\/\s*[A-Za-zÇĞİÖŞÜçğıöşü]+\s*sınıfında/i, room);
        }
        if (time) {
            var bits = time.split(/\s*(?:ile|-|–)\s*/).filter(Boolean);
            var phrase = bits.length >= 2 ? 'Saat ' + bits[0] + ' ile ' + bits[1] + ' arasında' : 'Saat ' + time;
            var replaced = next.replace(/Saat\s+\d{1,2}[.:]\d{2}\s+ile\s+\d{1,2}[.:]\d{2}\s+arasında/i, phrase);
            next = replaced === next ? next.replace(/Saat\s+\d{1,2}[.:]\d{2}/i, 'Saat ' + time) : replaced;
        }
        kulupSetPara(para, next);
    });
}
function kulupAlignSigns(doc, roles, advisor) {
    var paras = Array.prototype.slice.call(doc.getElementsByTagName('w:p'));
    var jobs = [];
    paras.forEach(function(para, index) {
        var label = kulupParaText(para).replace(/\s+/g, ' ').trim();
        if (!label || label.length > 60 || officeInTable(para)) return;
        var prev = index ? paras[index - 1] : null;
        var columns = null;
        if (/Başkan/.test(label) && /Yardımcısı/.test(label)) {
            columns = [
                { name: kulupRoleName(roles.baskan).toLocaleUpperCase('tr-TR'), role: 'Başkan' },
                { name: kulupRoleName(roles.yardimci).toLocaleUpperCase('tr-TR'), role: 'Başkan Yardımcısı' }
            ];
        } else if (/Sekreter/.test(label) && /Sayman/.test(label)) {
            columns = [
                { name: kulupRoleName(roles.sekreter).toLocaleUpperCase('tr-TR'), role: 'Sekreter' },
                { name: kulupRoleName(roles.sayman).toLocaleUpperCase('tr-TR'), role: 'Sayman' }
            ];
        } else if (/^Kulüp Danışman Öğretmeni$/i.test(label)) {
            columns = [{ name: (advisor || '').toLocaleUpperCase('tr-TR'), role: 'Kulüp Danışman Öğretmeni' }];
        }
        if (columns) jobs.push({ para: para, prev: prev, columns: columns });
    });
    jobs.forEach(function(job) {
        if (!job.para.parentNode) return;
        job.para.parentNode.insertBefore(officeSignTable(doc, job.columns), job.para);
        job.para.parentNode.removeChild(job.para);
        if (!job.prev || !job.prev.parentNode) return;
        var prevText = kulupParaText(job.prev).replace(/\s+/g, ' ').trim();
        if (prevText.length < 80) job.prev.parentNode.removeChild(job.prev);
    });
}
function kulupFillSignatures(doc, roles) {
    var body = doc.getElementsByTagName('w:body')[0];
    if (!body) return;
    var paras = kulupDirect(body, 'w:p');
    function paint(para, left, right) {
        var raw = Array.prototype.map.call(para.getElementsByTagName('w:t'), function(node) { return node.textContent || ''; }).join('');
        var count = 0;
        var next = raw.replace(/_{3,}/g, function(line) {
            count += 1;
            if (count === 1 && left) return left;
            if (count === 2 && right) return right;
            return line;
        });
        kulupSetPara(para, next);
    }
    paras.forEach(function(para, index) {
        if (!index) return;
        var label = kulupParaText(para);
        var prev = paras[index - 1];
        if (!/_{3,}/.test(kulupParaText(prev))) return;
        if (/Başkan/.test(label) && /Yardımcısı/.test(label)) paint(prev, kulupRoleName(roles.baskan), kulupRoleName(roles.yardimci));
        if (/Sekreter/.test(label) && /Sayman/.test(label)) paint(prev, kulupRoleName(roles.sekreter), kulupRoleName(roles.sayman));
    });
}
function kulupMonthLines(doc, monthName) {
    var want = monthName.toLocaleUpperCase('tr-TR');
    function share(label, lines) {
        var upper = String(label || '').toLocaleUpperCase('tr-TR');
        var hits = [];
        dutyMonths().forEach(function(item) {
            var name = item.name.toLocaleUpperCase('tr-TR');
            var at = upper.indexOf(name);
            if (at >= 0) hits.push({ name: name, at: at });
        });
        hits.sort(function(a, b) { return a.at - b.at; });
        var index = -1;
        hits.forEach(function(hit, at) { if (hit.name === want) index = at; });
        if (index < 0 || !lines.length) return [];
        if (hits.length < 2) return lines;
        var size = Math.ceil(lines.length / hits.length);
        return lines.slice(index * size, index * size + size);
    }
    function cellLines(cell) {
        var lines = [];
        kulupDirect(cell, 'w:p').forEach(function(para) {
            var text = kulupParaText(para);
            if (text) lines.push(text);
        });
        return lines;
    }
    var found = [];
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        if (found.length) return;
        var blob = sokRowText(table);
        if (/YAPILACAK/.test(blob)) {
            kulupDirect(table, 'w:tr').forEach(function(row) {
                if (found.length) return;
                var cells = sokDirectCells(row);
                if (cells.length < 4) return;
                var lines = share(kulupParaText(cells[0]), cellLines(cells[3]));
                if (lines.length) found = lines;
            });
            return;
        }
        if (!/AYLAR/.test(blob) || !/FAALİYET|FAALIYET/.test(blob)) return;
        kulupDirect(table, 'w:tr').forEach(function(row) {
            if (found.length) return;
            var cells = sokDirectCells(row);
            if (cells.length < 2) return;
            var lines = share(kulupParaText(cells[0]), cellLines(cells[1]));
            if (lines.length) found = lines;
        });
    });
    return found;
}
function kulupSetLines(cell, lines) {
    if (!lines.length) return;
    var paras = kulupDirect(cell, 'w:p');
    if (!paras.length) return;
    var proto = paras[0];
    paras.slice(1).forEach(function(para) { cell.removeChild(para); });
    lines.forEach(function(line, index) {
        var para = index ? proto.cloneNode(true) : proto;
        kulupSetPara(para, line);
        if (index) cell.appendChild(para);
    });
}
function kulupWeekCount(monthName, yearLabel) {
    var map = { Eylül: 9, Ekim: 10, Kasım: 11, Aralık: 12, Ocak: 1, Şubat: 2, Mart: 3, Nisan: 4, Mayıs: 5, Haziran: 6 };
    var month = map[monthName] || 0;
    var start = parseInt(yearLabel, 10) || new Date().getFullYear();
    if (!month) return 4;
    var year = month >= 9 ? start : start + 1;
    var cursor = new Date(year, month - 1, 1);
    var last = new Date(year, month, 0);
    var seen = {};
    while (cursor <= last) {
        var day = cursor.getDay();
        if (day !== 0 && day !== 6) {
            var back = (day + 6) % 7;
            var monday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - back);
            seen[monday.getFullYear() + '-' + monday.getMonth() + '-' + monday.getDate()] = true;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    var count = Object.keys(seen).length;
    if (count < 4) count = 4;
    if (count > 5) count = 5;
    return count;
}
function kulupWeekLabels(count, weeks) {
    var labels = [];
    if (count <= weeks) {
        for (var i = 0; i < count; i++) labels.push((i + 1) + '. Hafta');
        return labels;
    }
    var base = Math.floor(count / weeks);
    var extra = count % weeks;
    for (var week = 0; week < weeks; week++) {
        var size = base + (week < extra ? 1 : 0);
        for (var n = 0; n < size; n++) labels.push((week + 1) + '. Hafta');
    }
    return labels;
}
function kulupFillMonthReport(doc, lines, monthName, yearLabel) {
    if (!lines.length) return;
    var labels = kulupWeekLabels(lines.length, kulupWeekCount(monthName, yearLabel));
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        if (!/FAALİYET TARİHİ|FAALIYET TARIHI/.test(sokRowText(table))) return;
        var rows = kulupDirect(table, 'w:tr');
        if (rows.length < 2) return;
        var proto = rows[1];
        rows.slice(1).forEach(function(row) { table.removeChild(row); });
        lines.forEach(function(line, index) {
            var row = proto.cloneNode(true);
            var cells = sokDirectCells(row);
            if (cells[0]) sokSetCell(cells[0], labels[index] || '');
            if (cells[1]) sokSetCell(cells[1], line);
            table.appendChild(row);
        });
    });
    var body = doc.getElementsByTagName('w:body')[0];
    if (!body) return;
    var paras = kulupDirect(body, 'w:p');
    var start = -1;
    paras.forEach(function(para, index) { if (start < 0 && /ALINAN SONUÇLAR/.test(kulupParaText(para))) start = index; });
    if (start < 0) return;
    var slots = [];
    var stop = null;
    for (var i = start + 1; i < paras.length; i++) {
        var text = kulupParaText(paras[i]);
        if (/Danışman|Okul Müdürü/i.test(text)) { stop = paras[i]; break; }
        if (paras[i].getElementsByTagName('w:numPr').length) slots.push(paras[i]);
        else if (text) { stop = paras[i]; break; }
    }
    if (!slots.length) return;
    var proto = slots[0];
    lines.forEach(function(line, index) {
        var para = slots[index] || proto.cloneNode(true);
        kulupSetPara(para, line);
        if (!slots[index] && stop) stop.parentNode.insertBefore(para, stop);
    });
    slots.slice(lines.length).forEach(function(para) { if (para.parentNode) para.parentNode.removeChild(para); });
}
function kulupFillGrouped(doc, planDoc) {
    if (!planDoc) return;
    Array.prototype.forEach.call(doc.getElementsByTagName('w:tbl'), function(table) {
        if (!/AYLAR/.test(sokRowText(table)) || !/FAALİYET/.test(sokRowText(table))) return;
        kulupDirect(table, 'w:tr').slice(1).forEach(function(row) {
            var cells = sokDirectCells(row);
            if (cells.length < 2) return;
            var label = kulupParaText(cells[0]).toLocaleUpperCase('tr-TR');
            var lines = [];
            dutyMonths().forEach(function(item) {
                if (label.indexOf(item.name.toLocaleUpperCase('tr-TR')) < 0) return;
                kulupMonthLines(planDoc, item.name).forEach(function(line) { lines.push(line); });
            });
            if (lines.length) kulupSetLines(cells[1], lines);
        });
    });
}
function kulupFinish(type, monthName, bytes) {
    var label = kulupTypeName(type) + (monthName ? ' ' + monthName : '');
    return rehberStore('kulup', 'Kulüp ' + label, bytes).then(function() {
        window._skipHistory = true;
        openKulupSaved();
        window._skipHistory = false;
    });
}
function buildKulup() {
    if (!window.fflate) return alert('Sayfayı yenile.');
    var type = document.getElementById('kulup-tpl').value;
    window._kulupType = type;
    window._kulupDate = document.getElementById('kulup-date').value;
    var advisorEl = document.getElementById('kulup-advisor');
    if (advisorEl) {
        window._kulupAdvisor = advisorEl.value;
        var saved = officeBag();
        saved.kulupAdvisor = advisorEl.value.trim();
        officeWrite(saved);
    }
    var monthName = document.getElementById('kulup-month') ? document.getElementById('kulup-month').value : '';
    window._kulupMonth = monthName;
    if (type === 'yonetmelik') kulupReadRoles();
    var info = rehberInfo('', '', window._kulupDate, '');
    officeFileGet('kulup-tpl-' + type).then(function(buffer) {
        if (!buffer) return alert('Taslak bulunamadı.');
        var files = fflate.unzipSync(new Uint8Array(buffer));
        var doc = new DOMParser().parseFromString(new TextDecoder().decode(files['word/document.xml']), 'text/xml');
        kulupPatchHeader(doc, info, type === 'aylik' ? monthName : '');
        if (type === 'yonetmelik') {
            var bag = officeBag();
            kulupFillMembers(doc, bag.kulupMembers || []);
            kulupFillRoles(doc, bag.kulupRoles || {});
            kulupFillSignatures(doc, bag.kulupRoles || {});
            kulupAlignSigns(doc, bag.kulupRoles || {}, (officeBag().kulupAdvisor || info.teacher || '').trim());
            kulupFixTail(doc, info);
            kulupApplyMeeting(doc, document.getElementById('kulup-place') ? document.getElementById('kulup-place').value.trim() : '', document.getElementById('kulup-time') ? document.getElementById('kulup-time').value.trim() : '');
            files['word/document.xml'] = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
            return kulupFinish(type, '', fflate.zipSync(files));
        }
        if (type !== 'aylik' && type !== 'donem' && type !== 'yilsonu') {
            kulupFixTail(doc, info);
            files['word/document.xml'] = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
            return kulupFinish(type, '', fflate.zipSync(files));
        }
        return officeFileGet('kulup-tpl-yillik').then(function(planBuffer) {
            var planDoc = null;
            if (planBuffer) planDoc = new DOMParser().parseFromString(new TextDecoder().decode(fflate.unzipSync(new Uint8Array(planBuffer))['word/document.xml']), 'text/xml');
            if (type === 'aylik') {
                var lines = planDoc && monthName ? kulupMonthLines(planDoc, monthName) : [];
                if (!lines.length) alert('Yıllık planda bu ayın etkinliği bulunamadı. Başlıklar yine güncellenir.');
                else kulupFillMonthReport(doc, lines, monthName, info.year);
            } else if (planDoc) kulupFillGrouped(doc, planDoc);
            kulupFixTail(doc, info);
            files['word/document.xml'] = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
            return kulupFinish(type, type === 'aylik' ? monthName : '', fflate.zipSync(files));
        });
    }).catch(function(err) { alert('Kulüp belgesi oluşturulamadı. ' + (err && err.message ? err.message : '')); });
}
function openKulupSaved() {
    var list = rehberSavedHtml('kulup');
    officeShell('Kayıtlı kulüp belgeleri', list || '<p style="color:#fff;">Henüz kayıt yok.</p>', '', 'kulup-saved');
}

function officeDocKey(source, id) {
    if (source === 'rehber') return 'rehber-doc-' + id;
    if (source === 'zumre') return 'zumre-doc-' + id;
    if (source === 'sok') return 'sok-doc-' + id;
    if (source === 'upload') return 'upload-' + id;
    if (source === 'proje') return 'proje-doc-' + id;
    if (source === 'daily') return 'daily-doc-' + id;
    if (source === 'bep') return 'bep-doc-' + id;
    return '';
}
function officeDocName(source, id) {
    var bag = officeBag();
    var row = [];
    if (source === 'rehber') row = bag.rehberSaved || [];
    if (source === 'zumre') row = bag.zumreSaved || [];
    if (source === 'sok') row = bag.sokSaved || [];
    if (source === 'upload') row = bag.uploads || [];
    if (source === 'proje') row = bag.projeSaved || [];
    if (source === 'daily') row = bag.dailySaved || [];
    if (source === 'bep') row = bag.bepSaved || [];
    var item = row.filter(function(entry) { return entry.id === id; })[0];
    if (!item) return 'belge';
    if (source === 'upload') return item.name || 'dosya';
    if (source === 'proje') return (item.label || 'Ölçek') + '.xlsx';
    if (source === 'daily') return (item.label || 'Günlük plan') + '.docx';
    return (item.label || 'Belge') + '.docx';
}
function officeDocAct(source, id, preview) {
    var key = officeDocKey(source, id);
    var name = officeDocName(source, id);
    officeFileGet(key).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        var lower = name.toLowerCase();
        var mime = /\.pdf$/.test(lower) ? 'application/pdf' : (/\.xlsx?$/.test(lower) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : (/\.png$/.test(lower) ? 'image/png' : (/\.jpe?g$/.test(lower) ? 'image/jpeg' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')));
        if (preview && source === 'proje') return openProjeSheet(id);
        if (!preview && source === 'proje' && window.XLSX && window.fflate) {
            var savedProje = (officeBag().projeSaved || []).filter(function(item) { return item.id === id; })[0];
            try { bytes = projeBakeBytes(bytes, projeInfoNow(savedProje || {})); }
            catch (err) {}
        }
        if (!preview && /kapak/i.test(name) && /\.docx$/i.test(lower) && window.fflate) {
            try { bytes = dosyaRefreshCover(bytes); } catch (errCover) {}
        }
        if (preview && window.mammoth && /\.docx$/.test(lower)) {
            mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }).then(function(res) {
                var page = window.open('');
                if (!page) return saveBlob(bytes, name, mime);
                page.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + name + '</title></head><body style="font-family:Calibri,sans-serif;padding:28px;max-width:900px;margin:auto;">' + res.value + '</body></html>');
                page.document.close();
            }).catch(function() { saveBlob(bytes, name, mime); });
            return;
        }
        if (preview && /\.(pdf|png|jpe?g|gif|webp)$/.test(lower)) {
            window.open(URL.createObjectURL(new Blob([bytes], { type: mime })));
            return;
        }
        saveBlob(bytes, name, mime);
    });
}
function officeDocButtons(item, downloadOnly) {
    var id = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '');
    if (item.source === 'none') return '';
    if (item.source === 'year') return '<button class="auth-btn doc-mini" onclick="downloadSavedPlan(\'' + id + '\')">İndir</button>';
    if (downloadOnly && item.source === 'legacy') return '<button class="auth-btn doc-mini" onclick="dosyaLegacyOpen(' + item.sec + ',' + item.index + ',0)">İndir</button>';
    if (downloadOnly) return '<button class="auth-btn doc-mini" onclick="officeDocAct(\'' + item.source + '\',\'' + id + '\',0)">İndir</button>';
    if (item.source === 'legacy') return '<button class="auth-btn doc-mini" onclick="dosyaLegacyOpen(' + item.sec + ',' + item.index + ',1)">Görüntüle</button><button class="auth-btn doc-mini" onclick="dosyaLegacyOpen(' + item.sec + ',' + item.index + ',0)">İndir</button>';
    return '<button class="auth-btn doc-mini" onclick="officeDocAct(\'' + item.source + '\',\'' + id + '\',1)">Görüntüle</button><button class="auth-btn doc-mini" onclick="officeDocAct(\'' + item.source + '\',\'' + id + '\',0)">İndir</button>';
}
function officeDocTable(rows, downloadOnly) {
    if (!rows.length) return '<p style="color:#fff;">Belge yok.</p>';
    var body = rows.map(function(row) {
        var line = '<tr><td>' + officeEsc(row.item.name || '') + '</td><td>' + officeEsc(row.item.when || '') + '</td><td>' + officeDocButtons(row.item, downloadOnly) + (row.extra || '') + '</td></tr>';
        if (row.edit) line += '<tr><td colspan="3">' + row.edit + '</td></tr>';
        return line;
    }).join('');
    return '<div style="overflow-x:auto;background:#fff7ed;border-radius:12px;margin-bottom:10px;"><table class="data-table doc-table"><thead><tr><th>Belge</th><th>Bilgi</th><th>İşlem</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}
function officeDocCard(item, extra) {
    return '<div class="grade-card" style="cursor:default;"><h3>' + officeEsc(item.name || '') + '</h3><p>' + officeEsc(item.when || '') + '</p>' + officeDocButtons(item) + (extra || '') + '</div>';
}
function idariText(value) {
    return String(value || '').toLocaleLowerCase('tr-TR');
}
function openIdari() {
    officeShell('İdari işlemler', '<p style="color:#fff;">Dönemi seç. Yalnızca o dönem için oluşturduğun belgeler gelir.</p>' + officeCards([
        { title: '1. Dönem başı', text: 'Yıllık plan, zümre, ŞÖK, rehberlik', click: "openEvrakScreen('idari-term:d1b')" },
        { title: '1. Dönem sonu', text: 'Kulüp, aylık rapor, dönem sonu', click: "openEvrakScreen('idari-term:d1s')" },
        { title: '2. Dönem başı', text: 'II. dönem ŞÖK ve zümre', click: "openEvrakScreen('idari-term:d2b')" },
        { title: '2. Dönem sonu', text: 'Yıl sonu belgeleri', click: "openEvrakScreen('idari-term:d2s')" }
    ]), '', 'idari');
}
function openIdariTerm(term) {
    var bag = officeBag();
    var rehber = bag.rehberSaved || [];
    var zumre = bag.zumreSaved || [];
    var sok = bag.sokSaved || [];
    function rehberRows(test) {
        return rehber.filter(test).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    }
    function zumreRows(kind) {
        return zumre.filter(function(item) { return item.kind === kind || (kind === 'sene' && /sene başı/.test(idariText(item.label)) && !/yıl sonu/.test(idariText(item.label))); }).map(function(item) {
            return { source: 'zumre', id: item.id, name: item.label, when: item.when };
        });
    }
    function sokRows(kind, test) {
        return sok.filter(function(item) {
            if (kind === 'sene' && (item.kind === 'sene' || item.kind === 'sene8')) return true;
            if (kind === 'yil' && (item.kind === 'yil' || item.kind === 'yil8')) return true;
            if (item.kind && item.kind === kind) return true;
            if (item.kind) return false;
            return test(idariText(item.label));
        }).map(function(item) { return { source: 'sok', id: item.id, name: item.label, when: item.when }; });
    }
    function kulupRows(test) {
        return rehber.filter(function(item) { return item.kind === 'kulup' && test(idariText(item.label)); }).map(function(item) {
            return { source: 'rehber', id: item.id, name: item.label, when: item.when };
        });
    }
    var blocks = [];
    if (term === 'd1b') {
        blocks.push(['Yıllık plan', (bag.savedGrades || []).map(function(grade) { return { source: 'year', id: grade, name: grade + '. sınıf yıllık plan', when: 'Kayıtlı plan' }; })]);
        blocks.push(['Zümre', zumreRows('sene')]);
        blocks.push(['ŞÖK', sokRows('sene', function(label) { return /sene başı/.test(label) && !/yıl sonu/.test(label); })]);
        blocks.push(['Rehberlik planı', rehberRows(function(item) { return item.kind === 'yillik' && !/dönem sonu|yıl sonu/.test(idariText(item.label)); })]);
        blocks.push(['BEP yıllık plan', (bag.bepSaved || []).filter(function(item) { return item.term === 'y'; }).map(function(item) { return { source: 'bep', id: item.id, name: item.label, when: item.when }; })]);
    } else if (term === 'd1s') {
        blocks.push(['Kulüp dönem sonu', kulupRows(function(label) { return /dönem sonu/.test(label); })]);
        blocks.push(['Sınıf aylık rapor', rehberRows(function(item) { return item.kind === 'aylik' && /eylül|ekim|kasım|aralık|ocak/.test(idariText(item.label)); })]);
        blocks.push(['Sınıf dönem sonu', rehberRows(function(item) { return /dönem sonu/.test(idariText(item.label)) && item.kind !== 'kulup'; })]);
        blocks.push(['Ders içi ölçekler', (bag.projeSaved || []).filter(function(item) { return item.term !== '2'; }).map(function(item) { return { source: 'proje', id: item.id, name: item.label, when: item.when }; })]);
        blocks.push(['Günlük plan', sortDaily(bag.dailySaved).filter(function(item) { return parseInt(item.week, 10) <= 18; }).map(function(item) { return { source: 'daily', id: item.id, name: item.label, when: item.when }; })]);
        blocks.push(['BEP raporları', (bag.bepSaved || []).filter(function(item) { return item.term !== '2'; }).map(function(item) { return { source: 'bep', id: item.id, name: item.label, when: item.when }; })]);
    } else if (term === 'd2b') {
        blocks.push(['II. dönem ŞÖK', sokRows('donem2', function(label) { return /2\.?\s*dönem|ii\.?\s*dönem/.test(label); })]);
        blocks.push(['II. dönem zümre', zumreRows('donem2')]);
    } else {
        blocks.push(['Kulüp yıl sonu', kulupRows(function(label) { return /yıl sonu/.test(label); })]);
        blocks.push(['Zümre yıl sonu', zumreRows('yil')]);
        blocks.push(['ŞÖK yıl sonu', sokRows('yil', function(label) { return /yıl sonu/.test(label); })]);
        blocks.push(['Sınıf yıl sonu', rehberRows(function(item) { return item.kind !== 'kulup' && /yıl sonu/.test(idariText(item.label)); })]);
        blocks.push(['Ölçekler', (bag.projeSaved || []).filter(function(item) { return item.term === '2'; }).map(function(item) { return { source: 'proje', id: item.id, name: item.label, when: item.when }; })]);
        blocks.push(['Günlük plan', sortDaily(bag.dailySaved).filter(function(item) { return parseInt(item.week, 10) > 18; }).map(function(item) { return { source: 'daily', id: item.id, name: item.label, when: item.when }; })]);
        blocks.push(['BEP raporları', (bag.bepSaved || []).filter(function(item) { return item.term === '2'; }).map(function(item) { return { source: 'bep', id: item.id, name: item.label, when: item.when }; })]);
    }
    var titles = { d1b: '1. Dönem başı', d1s: '1. Dönem sonu', d2b: '2. Dönem başı', d2s: '2. Dönem sonu' };
    var html = blocks.map(function(block) {
        return '<h3 style="color:#fff;margin:16px 0 8px;">' + block[0] + '</h3>' + (block[1].length ? officeDocTable(block[1].map(function(item) { return { item: item }; }), true) : '<p style="color:#fff;">Henüz belge yok.</p>');
    }).join('');
    officeShell(titles[term] || 'İdari işlemler', html, '', 'idari-term:' + (term || 'd1b'));
}

function openBep() {
    officeShell('BEP', officeCards([
        { title: 'Ekle', text: 'Dönem raporu taslağı', click: "openEvrakScreen('bep-up')" },
        { title: 'Oluştur', text: 'Öğrenci ve yıllık plan', click: "openEvrakScreen('bep-build')" },
        { title: 'Kayıtlı', text: 'İndir, sil', click: "openEvrakScreen('bep-saved')" }
    ]), '', 'bep');
}
function bepKinds() {
    return [
        { id: 't1', label: '1. Dönem sonu BEP raporu' },
        { id: 't2', label: '2. Dönem sonu BEP raporu' },
        { id: 'plan', label: 'BEP yıllık plan' }
    ];
}
function openBepUpload() {
    var meta = officeBag().bepTpls || {};
    var rows = bepKinds().map(function(kind) {
        var info = meta[kind.id] || {};
        var extra = info.name ? '<button class="auth-btn doc-mini" onclick="downloadBepTpl(\'' + kind.id + '\')">İndir</button><button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteBepTpl(\'' + kind.id + '\')">Sil</button>' : '';
        return { item: { source: 'none', id: kind.id, name: info.name || kind.label, when: info.when || 'Taslak yok' }, extra: extra };
    });
    officeShell('BEP taslağı ekle',
        '<p style="color:#fff;">Üç taslak yükle: 1. dönem raporu, 2. dönem raporu ve BEP yıllık plan. Word yapısı bozulmaz.</p>' +
        '<select id="bep-kind" class="auth-input">' + bepKinds().map(function(kind) { return '<option value="' + kind.id + '">' + kind.label + '</option>'; }).join('') + '</select>' +
        '<input id="bep-file" type="file" accept=".docx" class="auth-input">' +
        '<button class="auth-btn" onclick="saveBepTpl()">Kaydet</button>' + officeDocTable(rows),
        '', 'bep-up');
}
function saveBepTpl() {
    var input = document.getElementById('bep-file');
    var file = input && input.files && input.files[0];
    var kind = document.getElementById('bep-kind').value;
    if (!file) return alert('Word seç.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('bep-tpl-' + kind, reader.result).then(function() {
            var bag = officeBag();
            bag.bepTpls = bag.bepTpls || {};
            bag.bepTpls[kind] = { name: file.name, when: new Date().toLocaleString('tr-TR') };
            officeWrite(bag);
            openBepUpload();
        });
    };
    reader.readAsArrayBuffer(file);
}
function downloadBepTpl(kind) {
    var info = (officeBag().bepTpls || {})[kind] || {};
    officeFileGet('bep-tpl-' + kind).then(function(buffer) {
        if (!buffer) return alert('Taslak yok.');
        saveBlob(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), info.name || 'bep.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
}
function deleteBepTpl(kind) {
    if (!confirm('Taslak silinsin mi?')) return;
    var bag = officeBag();
    bag.bepTpls = bag.bepTpls || {};
    delete bag.bepTpls[kind];
    officeWrite(bag);
    officeFileDel('bep-tpl-' + kind).then(function() {
        window._skipHistory = true;
        openBepUpload();
        window._skipHistory = false;
    });
}
function bepPlanOptions(selected) {
    var grades = ['3', '4', '5', '6', '7', '8'].filter(function(grade) {
        return officeWeeks(grade).some(function(week) { return week.unite || week.kazanim; });
    });
    if (!grades.length) return '<option value="">Yıllık plan yok</option>';
    return grades.map(function(grade) {
        return '<option value="' + grade + '"' + (String(selected) === grade ? ' selected' : '') + '>' + grade + '. sınıf yıllık plan</option>';
    }).join('');
}
function openBepBuild() {
    officeShell('BEP oluştur',
        '<p style="color:#fff;">Yıllık planda sınav ve kazanım notu istenmez. Dönem ve yıl sonu raporunda notlar istenir.</p>' +
        '<select id="bep-doc" class="auth-input" onchange="bepTune()"><option value="plan">Yıllık plan oluştur</option><option value="t1">1. Dönem raporu oluştur</option><option value="t2">Yıl sonu raporu oluştur</option></select>' +
        '<select id="bep-grade" class="auth-input" onchange="fillBep()"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="bep-branch" class="auth-input" onchange="fillBepStudents()"></select>' +
        '<select id="bep-student" class="auth-input"></select>' +
        '<select id="bep-plan" class="auth-input"></select>' +
        '<div id="bep-report-fields">' +
        '<input id="bep-y1" class="auth-input" placeholder="1. sınav notu">' +
        '<input id="bep-y2" class="auth-input" placeholder="2. sınav notu">' +
        '<input id="bep-s1" class="auth-input" placeholder="1. sözlü notu">' +
        '<input id="bep-s2" class="auth-input" placeholder="2. sözlü notu">' +
        '<input id="bep-s3" class="auth-input" placeholder="3. sözlü notu">' +
        '<select id="bep-status" class="auth-input"><option value="1">Kazanımlar: Başarılı</option><option value="2">Kazanımlar: Geliştirilmeli</option><option value="3">Kazanımlar: Başarısız</option></select>' +
        '</div>' +
        '<input id="bep-date" type="date" class="auth-input">' +
        '<button class="auth-btn" onclick="saveBepReport()">Oluştur ve kaydet</button>',
        '', 'bep-build');
    fillBep();
    bepTune();
}
function bepTune() {
    var kind = document.getElementById('bep-doc');
    var box = document.getElementById('bep-report-fields');
    if (box) box.style.display = kind && kind.value === 'plan' ? 'none' : 'block';
}
function fillBep() {
    var gradeEl = document.getElementById('bep-grade');
    var sel = document.getElementById('bep-branch');
    if (!gradeEl || !sel) return;
    var names = Object.keys((typeof fenData !== 'undefined' && fenData[gradeEl.value] && fenData[gradeEl.value].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option>A</option>';
    var plan = document.getElementById('bep-plan');
    if (plan) plan.innerHTML = bepPlanOptions(gradeEl.value);
    fillBepStudents();
}
function fillBepStudents() {
    var gradeEl = document.getElementById('bep-grade');
    var branchEl = document.getElementById('bep-branch');
    var studentEl = document.getElementById('bep-student');
    if (!gradeEl || !branchEl || !studentEl) return;
    var students = officeStudents(gradeEl.value, branchEl.value);
    window._bepStudents = students;
    studentEl.innerHTML = students.map(function(student, index) {
        return '<option value="' + index + '">' + officeEsc(student.no + ' ' + student.name) + '</option>';
    }).join('') || '<option value="">Öğrenci yok</option>';
}
function bepWords(value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return '';
    var ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
    var tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];
    if (n === 0) return 'SIFIR';
    if (n === 100) return 'YÜZ';
    if (n > 0 && n < 100) return (tens[Math.floor(n / 10)] + ' ' + ones[n % 10]).trim();
    return String(n);
}
function bepPlain(xml) {
    return String(xml || '').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function bepEsc(text) {
    return String(text == null ? '' : text).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function bepLeaf(xml, tag) {
    var out = [];
    var token = new RegExp('<' + tag + '[\\s>]|</' + tag + '>', 'g');
    var stack = [];
    var match;
    while ((match = token.exec(xml))) {
        if (match[0].charAt(1) !== '/') stack.push(match.index);
        else if (stack.length) {
            var start = stack.pop();
            var chunk = xml.slice(start, match.index + match[0].length);
            var body = chunk.slice(chunk.indexOf('>') + 1, chunk.length - match[0].length);
            if (!new RegExp('<' + tag + '[\\s>]').test(body)) out.push({ start: start, end: match.index + match[0].length, xml: chunk });
        }
    }
    return out;
}
function bepSetTexts(xml, text) {
    if (!/<w:t[\s>]/.test(xml)) {
        return xml.replace(/<\/w:p>/, '<w:r><w:t xml:space="preserve">' + bepEsc(text) + '</w:t></w:r></w:p>');
    }
    var used = false;
    return xml.replace(/<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g, function(all, attrs) {
        attrs = attrs || '';
        if (used) return '<w:t' + attrs + '></w:t>';
        used = true;
        if (attrs.indexOf('xml:space') < 0) attrs += ' xml:space="preserve"';
        var lines = String(text == null ? '' : text).split('\n');
        return '<w:t' + attrs + '>' + lines.map(function(line, index) {
            return (index ? '</w:t><w:br/><w:t' + attrs + '>' : '') + bepEsc(line);
        }).join('') + '</w:t>';
    });
}
function bepCells(rowXml) {
    return bepLeaf(rowXml, 'w:tc');
}
function bepGoals(grade, term) {
    var weeks = officeWeeks(grade).filter(function(week) {
        if (week.holiday) return false;
        var no = parseInt(week.no, 10);
        if (!no) return false;
        return term === '2' ? no > 18 : no <= 18;
    });
    var order = [];
    var map = {};
    weeks.forEach(function(week) {
        var unit = String(week.unite || '').replace(/\s+/g, ' ').trim() || 'Ünite';
        if (!map[unit]) { map[unit] = []; order.push(unit); }
        String(week.kazanim || '').split(/(?=FB\.\d)/).forEach(function(part) {
            var short = part.replace(/\s+/g, ' ').trim();
            if (short && map[unit].indexOf(short) < 0) map[unit].push(short);
        });
    });
    var rows = [];
    order.forEach(function(unit) {
        rows.push({ text: unit, head: true });
        map[unit].forEach(function(short) { rows.push({ text: short, head: false }); });
    });
    return rows;
}
function bepMarkRow(rowXml, status) {
    var cells = bepCells(rowXml);
    if (cells.length < 4) return rowXml;
    var parts = [];
    var cursor = 0;
    for (var i = 0; i < cells.length; i++) {
        parts.push(rowXml.slice(cursor, cells[i].start));
        parts.push(i >= 1 && i <= 3 ? bepSetTexts(cells[i].xml, String(status) === String(i) ? '✓' : '') : cells[i].xml);
        cursor = cells[i].end;
    }
    parts.push(rowXml.slice(cursor));
    return parts.join('');
}
function bepFillXml(xml, info) {
    var rows = bepLeaf(xml, 'w:tr');
    var header = -1;
    rows.forEach(function(row, index) {
        if (bepPlain(row.xml).indexOf('GELİŞİM ALANI') >= 0) header = index;
    });
    if (header >= 0 && rows[header + 1]) {
        var data = [];
        for (var d = header + 1; d < rows.length; d++) {
            if (bepCells(rows[d].xml).length < 4) break;
            data.push(rows[d]);
        }
        if (data.length) {
            var built = info.goals.length ? info.goals.map(function(goal) {
                var text = goal.text || goal;
                var copy = data[0].xml;
                var cells = bepCells(copy);
                if (cells[0]) copy = copy.slice(0, cells[0].start) + bepSetTexts(cells[0].xml, text) + copy.slice(cells[0].end);
                return bepMarkRow(copy, goal.head ? '' : info.status);
            }).join('') : data[0].xml;
            xml = xml.slice(0, data[0].start) + built + xml.slice(data[data.length - 1].end);
        }
    }
    rows = bepLeaf(xml, 'w:tr');
    var scoreMap = [
        ['1.YAZILI', info.scores[0]],
        ['2.YAZILI', info.scores[1]],
        ['1.PERFORMANS', info.scores[2]],
        ['2.PEROFRMANS', info.scores[3]],
        ['2.PERFORMANS', info.scores[3]],
        ['3.PERFORMANS', info.scores[4]]
    ];
    for (var r = rows.length - 1; r >= 0; r--) {
        var plain = bepPlain(rows[r].xml).toLocaleUpperCase('tr-TR');
        var hit = null;
        scoreMap.forEach(function(pair) { if (hit == null && plain.indexOf(pair[0]) >= 0) hit = pair[1]; });
        if (hit == null) continue;
        var cells = bepCells(rows[r].xml);
        var rowXml = rows[r].xml;
        if (cells[1]) rowXml = rowXml.replace(cells[1].xml, bepSetTexts(cells[1].xml, String(hit)));
        cells = bepCells(rowXml);
        if (cells[2]) rowXml = rowXml.replace(cells[2].xml, bepSetTexts(cells[2].xml, bepWords(hit)));
        xml = xml.slice(0, rows[r].start) + rowXml + xml.slice(rows[r].end);
    }
    var paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    paras.forEach(function(para) {
        var text = bepPlain(para).replace(/\s+/g, ' ').trim();
        var next = '';
        if (/Adı-Soyadı/i.test(text)) next = bepSetTexts(para, 'Öğrencinin Adı-Soyadı: ' + info.student + '    Sınıfı: ' + info.klass + '    No: ' + info.no);
        else if (/DEĞERLENDİRME RAPORU/i.test(text)) next = bepSetTexts(para, info.lesson + ' DERSİ BEP ' + info.termLabel + ' DEĞERLENDİRME RAPORU');
        else if (/EĞİTİM ÖĞRETİM YILI/i.test(text)) next = bepSetTexts(para, info.year + ' EĞİTİM ÖĞRETİM YILI');
        else if (/ORTAOKULU|İLKOKULU|LİSESİ/i.test(text) && text.length < 80 && !/BEP/i.test(text)) next = bepSetTexts(para, info.school);
        else if (/DERS ÖĞRETMENİ/i.test(text)) return;
        else if (/^\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{2,4}/.test(text) && text.length < 30) next = bepSetTexts(para, info.date);
        if (next) xml = xml.replace(para, next);
    });
    return bepFixSigns(xml, info);
}
function bepXmlEsc(value) {
    return String(value || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}
function bepSignTable(pairs) {
    var width = Math.floor(9000 / Math.max(pairs.length, 1));
    var nil = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function(edge) {
        return '<w:' + edge + ' w:val="nil"/>';
    }).join('');
    function cell(text, bold) {
        return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>' +
            (bold ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + bepXmlEsc(text) + '</w:t></w:r></w:p></w:tc>';
    }
    var grid = pairs.map(function() { return '<w:gridCol w:w="' + width + '"/>'; }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>' + nil + '</w:tblBorders></w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>' +
        '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + pairs.map(function(pair) { return cell(pair.name, true); }).join('') + '</w:tr>' +
        '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + pairs.map(function(pair) { return cell(pair.role, false); }).join('') + '</w:tr></w:tbl>';
}
function bepFixSigns(xml, info) {
    var paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (var i = 0; i < paras.length; i++) {
        var text = bepPlain(paras[i]).replace(/\s+/g, ' ').trim();
        if (!text || text.length > 90) continue;
        var nextText = paras[i + 1] ? bepPlain(paras[i + 1]).replace(/\s+/g, ' ').trim() : '';
        var pairs = null;
        var eatNext = false;
        if (/ÖĞRETMENİ/i.test(text) && /REHBER ÖĞRETMENİ/i.test(text)) {
            pairs = [
                { name: info.teacher || '', role: (info.lesson || 'Ders') + ' Öğretmeni' },
                { name: info.counselor || '', role: 'Okul Rehber Öğretmeni' }
            ];
        } else if (/ÖĞRETMENİ/i.test(text) && /MÜDÜR/i.test(text) && !/ONAY/i.test(text)) {
            pairs = [
                { name: info.teacher || '', role: 'Ders Öğretmeni' },
                { name: info.principal || '', role: 'Okul Müdürü' }
            ];
        } else if (/öğretmeni$/i.test(text) && nextText.length < 40 && (/rehber öğretmeni$/i.test(nextText) || /okul müdürü$/i.test(nextText))) {
            eatNext = true;
            pairs = /müdür/i.test(nextText)
                ? [{ name: info.teacher || '', role: 'Ders Öğretmeni' }, { name: info.principal || '', role: 'Okul Müdürü' }]
                : [{ name: info.teacher || '', role: (info.lesson || 'Ders') + ' Öğretmeni' }, { name: info.counselor || '', role: 'Okul Rehber Öğretmeni' }];
        }
        if (!pairs) continue;
        var prev = i ? paras[i - 1] : '';
        var prevText = prev ? bepPlain(prev).replace(/\s+/g, ' ').trim() : '';
        if (prev && prevText.length < 80 && !/öğretmen|müdür|onay|tarih|ölçüt|eğitim/i.test(prevText)) xml = xml.replace(prev, '');
        xml = xml.replace(paras[i], bepSignTable(pairs));
        if (eatNext && paras[i + 1]) xml = xml.replace(paras[i + 1], '');
    }
    return xml;
}
function bepTopics(konu) {
    var text = String(konu || '').replace(/\s+/g, ' ').trim();
    if (!text || /^D\d+\./.test(text) || text.indexOf('Okuryazar') >= 0) return [];
    return text.replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1|$2').split('|').map(function(part) { return part.trim(); }).filter(Boolean);
}
function bepKazList(kazanim) {
    var parts = String(kazanim || '').split(/(?=FB\.\d)/).map(function(part) { return part.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    return parts.length ? parts : (String(kazanim || '').trim() ? [String(kazanim).replace(/\s+/g, ' ').trim()] : []);
}
function bepAccusative(phrase) {
    var text = String(phrase || '').replace(/\s+/g, ' ').replace(/[.:;]+$/g, '').trim();
    if (!text) return '';
    var parts = text.split(' ');
    var bare = parts[parts.length - 1].replace(/['’].*$/, '');
    var vowels = bare.toLocaleLowerCase('tr-TR').match(/[aeıioöuü]/g) || ['e'];
    var harmony = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' }[vowels[vowels.length - 1]] || 'i';
    var vowelEnd = /[aeıioöuüAEIİOÖUÜ]$/.test(bare);
    parts[parts.length - 1] = bare + "'" + (vowelEnd ? 'n' : '') + harmony;
    return parts.join(' ');
}
function bepFinite(kazanim) {
    var text = String(kazanim || '').toLocaleLowerCase('tr-TR');
    var rules = [
        ['tanımlayabil', 'tanımlar'], ['açıklayabil', 'açıklar'], ['karşılaştırabil', 'karşılaştırır'],
        ['sınıflandırabil', 'sınıflandırır'], ['gruplandırabil', 'gruplandırır'], ['ayrıştırabil', 'ayrıştırır'],
        ['oluşturabil', 'oluşturur'], ['tasarlayabil', 'tasarlar'], ['çözümleyebil', 'çözümler'],
        ['sorgulayabil', 'sorgular'], ['tartışabil', 'tartışır'], ['gözlemleyebil', 'gözlemler'],
        ['yapılandırabil', 'yapılandırır'], ['yansıtabil', 'yansıtır'], ['ölçebil', 'ölçer'],
        ['çizebil', 'çizer'], ['çözebil', 'çözer'], ['kaydedebil', 'kaydeder'],
        ['akıl yürüt', 'açıklar'], ['çıkarım', 'açıklar'], ['toplayabil', 'öğrenir']
    ];
    for (var i = 0; i < rules.length; i++) if (text.indexOf(rules[i][0]) >= 0) return rules[i][1];
    return 'öğrenir';
}
function bepLong(week) {
    var topics = bepTopics(week.konu);
    if (!topics.length) {
        var unit = String(week.unite || '').replace(/^\d+\.\s*ÜNİTE:\s*/i, '').replace(/\s+/g, ' ').trim();
        if (unit) topics = [unit];
    }
    var outcomes = bepKazList(week.kazanim);
    if (!topics.length) return outcomes.join('\n');
    return topics.map(function(topic, index) {
        return bepAccusative(topic) + ' ' + bepFinite(outcomes[Math.min(index, Math.max(outcomes.length - 1, 0))] || '');
    }).join('\n');
}
function bepShort(week) {
    return bepKazList(week.kazanim).join('\n');
}
function bepFillPlan(xml, info) {
    var rows = bepLeaf(xml, 'w:tr');
    var start = -1;
    rows.forEach(function(row, index) {
        var text = bepPlain(row.xml);
        if (text.indexOf('Uzun Dönemli Amaç') >= 0) start = index + 1;
    });
    while (start >= 0 && start < rows.length && /Değerlendirme Yöntem|Performans Yeterli/.test(bepPlain(rows[start].xml))) start++;
    var data = [];
    var sample = '';
    for (var i = start; i < rows.length; i++) {
        var plain = bepPlain(rows[i].xml);
        if (/Eğitim Ortamı|Ölçüt \(/.test(plain)) break;
        var cells = bepCells(rows[i].xml);
        if (cells.length < 4) break;
        data.push(rows[i]);
        if (!sample && cells.length >= 8) sample = rows[i].xml;
    }
    if (!data.length || !sample) return xml;
    var built = info.weeks.map(function(week, index) {
        var cells = bepCells(sample);
        var values = {};
        var n = index + 1;
        if (week.holiday) {
            values[2] = week.label || 'Tatil Haftası';
            values[0] = '';
            values[1] = '';
            values[3] = '';
            values[4] = '';
        } else {
            var label = String(week.label || '');
            values[0] = week.ay || '';
            values[1] = label.indexOf(':') >= 0 ? label.split(':').slice(1).join(':').trim() : label;
            values[2] = bepLong(week);
            values[3] = bepShort(week);
            values[4] = n % 2 ? '4/5 80%' : '5/5 100%';
        }
        values[cells.length - 1] = String(n);
        var parts = [];
        var cursor = 0;
        cells.forEach(function(cell, cellIndex) {
            parts.push(sample.slice(cursor, cell.start));
            parts.push(values[cellIndex] != null ? bepSetTexts(cell.xml, values[cellIndex]) : cell.xml);
            cursor = cell.end;
        });
        parts.push(sample.slice(cursor));
        return parts.join('');
    }).join('');
    xml = xml.slice(0, data[0].start) + built + xml.slice(data[data.length - 1].end);
    function putPair(label, value) {
        var list = bepLeaf(xml, 'w:tr');
        for (var r = 0; r < list.length; r++) {
            var cells = bepCells(list[r].xml);
            if (cells.length < 2) continue;
            var name = bepPlain(cells[0].xml).replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
            if (name !== label) continue;
            var rowXml = list[r].xml.slice(0, cells[1].start) + bepSetTexts(cells[1].xml, value) + list[r].xml.slice(cells[1].end);
            xml = xml.slice(0, list[r].start) + rowXml + xml.slice(list[r].end);
            return;
        }
    }
    putPair('ADI SOYADI', info.student);
    putPair('SINIFI', info.klass.replace('/', ''));
    putPair('NUMARASI', String(info.no));
    var paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    paras.forEach(function(para, index) {
        var text = bepPlain(para).replace(/\s+/g, ' ').trim();
        var next = '';
        if (/REHBER ÖĞRETMENİ/i.test(text) && paras[index - 1]) return;
        if (/^Onay Tarihi/i.test(text) && paras[index - 1]) next = '';
        if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(text) && info.date) next = bepSetTexts(para, info.date);
        if (next) xml = xml.replace(para, next);
    });
    paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (var p = 1; p < paras.length; p++) {
        var shown = bepPlain(paras[p]).replace(/\s+/g, ' ').trim();
        if (/REHBER ÖĞRETMENİ/i.test(shown)) xml = xml.replace(paras[p - 1], bepSetTexts(paras[p - 1], info.teacher + '                              ' + (info.counselor || '')));
        if (/^Onay Tarihi/i.test(shown)) xml = xml.replace(paras[p - 1], bepSetTexts(paras[p - 1], info.principal));
    }
    return bepFixSigns(xml, info);
}
function saveBepReport() {
    var grade = document.getElementById('bep-grade').value;
    var branch = document.getElementById('bep-branch').value;
    var student = (window._bepStudents || [])[parseInt(document.getElementById('bep-student').value, 10)];
    var docKind = document.getElementById('bep-doc') ? document.getElementById('bep-doc').value : 't1';
    var planMode = docKind === 'plan';
    var term = docKind === 't2' ? '2' : '1';
    var planGrade = document.getElementById('bep-plan').value || grade;
    if (!student) return alert('Öğrenci seç.');
    var tplKey = planMode ? 'plan' : docKind;
    if (!(officeBag().bepTpls || {})[tplKey]) return alert(planMode ? 'Önce Ekle kartından BEP yıllık plan taslağını yükle.' : 'Önce Ekle kartından bu dönemin rapor taslağını yükle.');
    var goals = planMode ? [] : bepGoals(planGrade, term);
    var weeks = officeWeeks(planGrade).filter(function(week) { return week.holiday || week.no || week.kazanim; });
    if (planMode && !weeks.length) return alert('Bu sınıfın yıllık planı yok. Çerçeveyi yükleyip planı kaydet.');
    if (!planMode && !goals.length) return alert('Bu sınıfın yıllık planında kazanım yok. Önce yıllık planı kaydet.');
    var dateVal = document.getElementById('bep-date').value;
    var dateText = !dateVal ? '' : (planMode ? dateVal.slice(8, 10) + '.' + dateVal.slice(5, 7) + '.' + dateVal.slice(0, 4) : dateVal.slice(8, 10) + '/ ' + dateVal.slice(5, 7) + ' / ' + dateVal.slice(0, 4));
    var lesson = (typeof canonicalSubject === 'function' && typeof currentTeacher !== 'undefined' && currentTeacher) ? canonicalSubject(currentTeacher.subject) : ((currentTeacher && currentTeacher.subject) || 'Fen Bilimleri');
    var info = {
        student: student.name,
        no: student.no,
        klass: grade + '/' + branch,
        termLabel: term === '2' ? '2. DÖNEM SONU' : '1. DÖNEM SONU',
        lesson: String(lesson || 'Fen Bilimleri').toLocaleUpperCase('tr-TR'),
        year: typeof currentPortalYear === 'function' ? currentPortalYear() : '',
        school: ((currentTeacher && currentTeacher.school_name) || '').toLocaleUpperCase('tr-TR'),
        teacher: ((currentTeacher && currentTeacher.full_name) || '').toLocaleUpperCase('tr-TR'),
        principal: (officeStaff().principal || '').toLocaleUpperCase('tr-TR'),
        counselor: ((officeBag().counselors || [])[0] || '').toLocaleUpperCase('tr-TR'),
        date: dateText,
        scores: planMode ? ['', '', '', '', ''] : ['bep-y1', 'bep-y2', 'bep-s1', 'bep-s2', 'bep-s3'].map(function(id) { return document.getElementById(id).value.trim(); }),
        status: planMode ? '' : document.getElementById('bep-status').value,
        goals: goals,
        weeks: weeks
    };
    officeFileGet('bep-tpl-' + tplKey).then(function(buffer) {
        if (!buffer || !window.fflate) return alert('Taslak bulunamadı.');
        var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        var files = fflate.unzipSync(bytes);
        var xml = new TextDecoder().decode(files['word/document.xml']);
        files['word/document.xml'] = new TextEncoder().encode(planMode ? bepFillPlan(xml, info) : bepFillXml(xml, info));
        var packed = fflate.zipSync(files);
        var id = 'b' + Date.now().toString(36);
        var label = planMode
            ? grade + '/' + branch + ' ' + student.name + ' BEP yıllık plan'
            : grade + '/' + branch + ' ' + student.name + ' ' + (term === '2' ? 'yıl sonu' : '1. dönem') + ' BEP';
        officeFilePut('bep-doc-' + id, packed).then(function() {
            var bag = officeBag();
            bag.bepSaved = bag.bepSaved || [];
            bag.bepSaved.unshift({ id: id, label: label, grade: grade, branch: branch, term: planMode ? 'y' : term, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            openBepSaved();
        });
    });
}
function openBepSaved() {
    var rows = (officeBag().bepSaved || []).map(function(item) {
        return { item: { source: 'bep', id: item.id, name: item.label, when: item.when }, extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteBepSaved(\'' + item.id + '\')">Sil</button>' };
    });
    officeShell('Kayıtlı BEP', rows.length ? officeDocTable(rows, true) : '<p style="color:#fff;">Henüz kayıt yok.</p>', '', 'bep-saved');
}
function deleteBepSaved(id) {
    if (!confirm('BEP silinsin mi?')) return;
    var bag = officeBag();
    bag.bepSaved = (bag.bepSaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('bep-doc-' + id).then(function() {
        window._skipHistory = true;
        openBepSaved();
        window._skipHistory = false;
    });
}

function dosyaCatalog() {
    return [
        { id: 'idari', index: 0, title: 'İdari evrak', slots: [
            { id: 'ataturk', title: '1. Atatürk portresi', keys: ['atatürk', 'portre', 'bayrak'] },
            { id: 'istiklal', title: '2. İstiklal Marşı', keys: ['istiklal'] },
            { id: 'hitabe', title: '3. Gençliğe Hitabe', keys: ['hitabe', 'gençliğe'] },
            { id: 'takvim', title: '4. İş günü takvimi', keys: ['takvim', 'iş günü'] },
            { id: 'yillik', title: '5. Yıllık plan', keys: ['yıllık plan', 'yillik plan'] },
            { id: 'gunluk', title: '6. Günlük plan', keys: ['günlük plan', 'gunluk plan'] },
            { id: 'program', title: '7. Ders programı', keys: ['ders program'] },
            { id: 'sok', title: '8. ŞÖK', keys: ['şök', 'şube öğretmen'] },
            { id: 'zumre', title: '9. Zümre', keys: ['zümre', 'zumre'] },
            { id: 'proje', title: '10. Proje ölçeği', keys: ['proje ölçek', 'ders içi ölçek'] },
            { id: 'diger', title: '11. Diğer', keys: [] }
        ]},
        { id: 'rehber', index: 1, title: 'Sınıf rehberlik', slots: [
            { id: 'yillik', title: 'Yıllık plan', keys: ['yıllık plan', 'rehberlik plan'] },
            { id: 'aylik', title: 'Aylık rapor', keys: ['aylık rapor', 'aylik rapor'] },
            { id: 'oturma', title: 'Oturma planı', keys: ['oturma'] },
            { id: 'secim', title: 'Seçim tutanağı', keys: ['seçim', 'secim'] },
            { id: 'nobet', title: 'Nöbet listesi', keys: ['nöbet', 'nobet'] },
            { id: 'veli', title: 'Veli', keys: ['veli'] },
            { id: 'diger', title: 'Diğer', keys: [] }
        ]},
        { id: 'kulup', index: 2, title: 'Kulüp', slots: [
            { id: 'yonetmelik', title: 'Yönetmelik', keys: ['kulüp yönetmelik', 'tüzük'] },
            { id: 'yillik', title: 'Yıllık plan', keys: ['yıllık'] },
            { id: 'aylik', title: 'Aylık rapor', keys: ['aylık'] },
            { id: 'rapor', title: 'Dönem ve yıl sonu', keys: ['dönem sonu', 'yıl sonu'] },
            { id: 'liste', title: 'Üye listesi', keys: ['üye', 'öğrenci list'] },
            { id: 'diger', title: 'Diğer', keys: [] }
        ]},
        { id: 'mevzuat', index: 3, title: 'Mevzuat', slots: [
            { id: 'kanun1739', title: '1739 sayılı kanun', keys: ['1739', '1789', 'nolu kanun', 'temel kanun'] },
            { id: 'ortaogretim', title: 'Ortaöğretim yönetmeliği', keys: ['ortaöğretim'] },
            { id: 'kilik', title: 'Kılık kıyafet', keys: ['kılık', 'kıyafet'] },
            { id: 'sosyal', title: 'Sosyal etkinlikler', keys: ['sosyal kulüp', 'sosyal etkinlik', 'kulüpler yönetmel'] },
            { id: 'kanun657', title: '657 sayılı kanun', keys: ['657'] },
            { id: 'diger', title: 'Diğer', keys: [] }
        ]}
    ];
}
function dosyaSection(id) {
    return dosyaCatalog().filter(function(section) { return section.id === id; })[0] || dosyaCatalog()[0];
}
function dosyaPlace(name, section) {
    var text = String(name || '').toLocaleLowerCase('tr-TR');
    var best = null;
    var score = 0;
    dosyaCatalog().forEach(function(sec) {
        if (section && section !== 'auto' && sec.id !== section) return;
        sec.slots.forEach(function(slot) {
            (slot.keys || []).forEach(function(key) {
                if (text.indexOf(key) >= 0 && key.length > score) {
                    score = key.length;
                    best = { section: sec.id, slot: slot.id };
                }
            });
        });
    });
    if (best) return best;
    return { section: section && section !== 'auto' ? section : 'idari', slot: 'diger' };
}
function dosyaSystem(section, slot) {
    var bag = officeBag();
    if (section === 'idari' && slot === 'yillik') return (bag.savedGrades || []).map(function(grade) { return { source: 'year', id: grade, name: grade + '. sınıf yıllık plan', when: 'Evrak / Yıllık plan / Kayıtlı' }; });
    if (section === 'idari' && slot === 'zumre') return (bag.zumreSaved || []).map(function(item) { return { source: 'zumre', id: item.id, name: item.label, when: item.when }; });
    if (section === 'idari' && slot === 'sok') return (bag.sokSaved || []).map(function(item) { return { source: 'sok', id: item.id, name: item.label, when: item.when }; });
    if (section === 'idari' && slot === 'gunluk') return sortDaily(bag.dailySaved).map(function(item) { return { source: 'daily', id: item.id, name: item.label, when: item.when }; });
    if (section === 'idari' && slot === 'proje') return (bag.projeSaved || []).map(function(item) { return { source: 'proje', id: item.id, name: item.label, when: item.when }; });
    var rehber = bag.rehberSaved || [];
    if (section === 'rehber' && slot === 'yillik') return rehber.filter(function(item) { return item.kind === 'yillik'; }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    if (section === 'rehber' && slot === 'aylik') return rehber.filter(function(item) { return item.kind === 'aylik'; }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    if (section === 'rehber' && slot === 'oturma') return rehber.filter(function(item) { return item.kind === 'oturma'; }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    if (section === 'rehber' && slot === 'secim') return rehber.filter(function(item) { return item.kind === 'secim'; }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    if (section === 'rehber' && slot === 'nobet') return rehber.filter(function(item) { return item.kind === 'nobet'; }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
    if (section !== 'kulup') return [];
    return rehber.filter(function(item) {
        if (item.kind !== 'kulup') return false;
        var text = String(item.label || '').toLocaleLowerCase('tr-TR');
        if (slot === 'rapor') return /dönem sonu|yıl sonu/.test(text);
        if (slot === 'aylik') return text.indexOf('aylık') >= 0;
        if (slot === 'yillik') return text.indexOf('yıllık') >= 0;
        if (slot === 'yonetmelik') return /yönetmelik|tüzük/.test(text);
        return false;
    }).map(function(item) { return { source: 'rehber', id: item.id, name: item.label, when: item.when }; });
}
function openDosya() {
    officeShell('Öğretmen dosyası', officeCards([
        { title: 'Dosya yükle', text: 'Toplu, her format', click: "openEvrakScreen('dosya-up')" },
        { title: 'İdari evrak', text: 'Yıllık plan, zümre, ŞÖK', click: "openEvrakScreen('dosya-sec:idari')" },
        { title: 'Sınıf rehberlik', text: 'Oturma, nöbet, plan', click: "openEvrakScreen('dosya-sec:rehber')" },
        { title: 'Kulüp', text: 'Tüzük, plan, rapor', click: "openEvrakScreen('dosya-sec:kulup')" },
        { title: 'Mevzuat', text: 'Kanun ve yönetmelik', click: "openEvrakScreen('dosya-sec:mevzuat')" }
    ]), '', 'dosya');
}
function dosyaNormalize() {
    var bag = officeBag();
    var changed = false;
    (bag.uploads || []).forEach(function(file) {
        var place = dosyaPlace(file.name, 'auto');
        if (place.slot === 'diger') return;
        if (file.section !== place.section || file.slot !== place.slot) {
            file.section = place.section;
            file.slot = place.slot;
            changed = true;
        }
    });
    if (changed) officeWrite(bag);
}
function openDosyaUpload() {
    dosyaNormalize();
    var options = '<option value="auto">İsme göre yerleştir</option>' + dosyaCatalog().map(function(section) {
        return '<option value="' + section.id + '">' + section.title + '</option>';
    }).join('');
    var rows = (officeBag().uploads || []).map(function(file) {
        var sec = dosyaSection(file.section);
        return { item: { source: 'upload', id: file.id, name: file.name, when: (sec.title || '') + ' · ' + (file.when || '') }, extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="dosyaDelete(\'' + file.id + '\')">Sil</button>' };
    });
    officeShell('Dosya yükle',
        '<p style="color:#fff;">Birden fazla dosya seç. Pdf, Word, Excel veya resim kaydedilir. Adında 1739, oturma, nöbet, yıllık plan geçen dosya ilgili karta düşer.</p>' +
        '<select id="dosya-section" class="auth-input">' + options + '</select>' +
        '<input id="dosya-files" type="file" class="auth-input" multiple>' +
        '<button class="auth-btn" onclick="saveDosyaUploads()">Kaydet</button>' +
        officeDocTable(rows, true),
        '', 'dosya-up');
}
function saveDosyaUploads() {
    var input = document.getElementById('dosya-files');
    var files = Array.prototype.slice.call((input && input.files) || []);
    if (!files.length) return alert('Dosya seç.');
    var picked = document.getElementById('dosya-section').value;
    var chain = Promise.resolve();
    files.forEach(function(file) {
        chain = chain.then(function() {
            if (file.size > 8000000) { alert(file.name + ' 8 MB üstü, atlandı.'); return; }
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result); };
                reader.onerror = function() { reject(reader.error); };
                reader.readAsArrayBuffer(file);
            }).then(function(buffer) {
                var id = 'u' + Date.now() + Math.floor(Math.random() * 1000);
                var place = dosyaPlace(file.name, 'auto');
                if (place.slot === 'diger' && picked !== 'auto') place = { section: picked, slot: 'diger' };
                return officeFilePut('upload-' + id, buffer).then(function() {
                    var bag = officeBag();
                    bag.uploads = bag.uploads || [];
                    bag.uploads.unshift({ id: id, name: file.name, section: place.section, slot: place.slot, when: new Date().toLocaleString('tr-TR') });
                    officeWrite(bag);
                });
            });
        });
    });
    chain.then(function() { openDosyaUpload(); }).catch(function() { alert('Dosya kaydedilemedi.'); });
}
function dosyaDelete(id, back) {
    if (!confirm('Dosya silinsin mi?')) return;
    var bag = officeBag();
    bag.uploads = (bag.uploads || []).filter(function(file) { return file.id !== id; });
    officeWrite(bag);
    officeFileDel('upload-' + id).then(function() {
        window._skipHistory = true;
        if (back) openDosyaSection(back);
        else openDosyaUpload();
        window._skipHistory = false;
    });
}
function dosyaLegacyOpen(sec, index, preview) {
    var file = (((officeBag().files || {})[sec] || [])[index]) || null;
    if (!file || !file.url) return alert('Dosya bulunamadı.');
    if (preview) window.open(file.url);
    else {
        var link = document.createElement('a');
        link.href = file.url;
        link.download = file.name || 'dosya';
        link.click();
    }
}
function dosyaLegacyDelete(sec, index, section) {
    if (!confirm('Dosya silinsin mi?')) return;
    var bag = officeBag();
    if (bag.files && bag.files[sec]) bag.files[sec].splice(index, 1);
    officeWrite(bag);
    window._skipHistory = true;
    openDosyaSection(section);
    window._skipHistory = false;
}
function dosyaSaveEdit(id, section) {
    var picked = document.getElementById('dosya-move').value.split('|');
    var name = document.getElementById('dosya-rename').value.trim();
    var bag = officeBag();
    (bag.uploads || []).forEach(function(file) {
        if (file.id !== id) return;
        file.section = picked[0] || file.section;
        file.slot = picked[1] || file.slot;
        if (name) file.name = name;
    });
    officeWrite(bag);
    window._dosyaEdit = '';
    window._skipHistory = true;
    openDosyaSection(picked[0] || section);
    window._skipHistory = false;
}
function dosyaOrder(name) {
    var match = String(name || '').match(/^\s*(\d{1,2})\s*[\.\-]/);
    return match ? parseInt(match[1], 10) : 1000;
}
function dosyaSortRows(rows) {
    return rows.slice().sort(function(a, b) {
        var diff = dosyaOrder(a.item && a.item.name) - dosyaOrder(b.item && b.item.name);
        if (diff) return diff;
        return String((a.item && a.item.name) || '').localeCompare(String((b.item && b.item.name) || ''), 'tr');
    });
}
function dosyaRefreshCover(bytes) {
    if (!window.fflate) return bytes;
    var packed = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var files;
    try { files = fflate.unzipSync(packed); } catch (err) { return packed; }
    if (!files['word/document.xml']) return packed;
    var school = '';
    var year = '';
    try {
        school = ((currentTeacher && currentTeacher.school_name) || localStorage.getItem('fen_school_name') || '').trim();
        year = (typeof currentPortalYear === 'function' ? currentPortalYear() : '') || '';
    } catch (err2) {}
    if (!school && !year) return packed;
    var xml = new TextDecoder().decode(files['word/document.xml']);
    if (school) {
        var upper = school.toLocaleUpperCase('tr-TR');
        xml = xml.replace(/>([^<]{0,80})</g, function(all, inner) {
            if (!/ORTAOKULU|İLKOKULU|LİSESİ|OTAOKULU/.test(inner)) return all;
            return '>' + inner.replace(/[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü .'\-]{0,60}(?:ORTAOKULU|İLKOKULU|LİSESİ|OTAOKULU)/g, upper) + '<';
        });
    }
    if (year) xml = xml.replace(/20\d{2}\s*[-–]\s*20\d{2}/g, year);
    files['word/document.xml'] = new TextEncoder().encode(xml);
    return fflate.zipSync(files);
}
function dosyaNameGrade(name) {
    var match = String(name || '').toLocaleLowerCase('tr-TR').match(/(\d)\s*\.?\s*s[ıi]n[ıi]f/);
    return match ? match[1] : '';
}
function dosyaGunlukItems(grade) {
    if (!grade) return [];
    var rows = sortDaily(officeBag().dailySaved).filter(function(item) {
        return String(item.grade) === String(grade);
    }).map(function(item) {
        return { item: { source: 'daily', id: item.id, name: item.label, when: item.when } };
    });
    (officeBag().uploads || []).filter(function(file) {
        return file.section === 'idari' && file.slot === 'gunluk' && dosyaNameGrade(file.name) === String(grade);
    }).forEach(function(file) {
        rows.push({
            item: { source: 'upload', id: file.id, name: file.name, when: file.when },
            extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="dosyaDelete(\'' + file.id + '\',\'idari\')">Sil</button>'
        });
    });
    return rows;
}
function paintDosyaGunluk() {
    var sel = document.getElementById('dosya-gunluk-grade');
    if (!sel) return;
    window._dosyaGunlukGrade = sel.value;
    var host = document.getElementById('dosya-gunluk-list');
    if (!host) return;
    host.innerHTML = sel.value ? officeDocTable(dosyaGunlukItems(sel.value), true) : '<p style="color:#fff;">Sınıf seç.</p>';
}
function openDosyaSection(sectionId) {
    dosyaNormalize();
    var section = dosyaSection(sectionId);
    var uploads = officeBag().uploads || [];
    var legacy = ((officeBag().files || {})[section.index] || []);
    var html = section.slots.map(function(slot) {
        if (section.id === 'idari' && slot.id === 'gunluk') {
            var grade = window._dosyaGunlukGrade || '';
            var options = '<option value="">Sınıf seç</option>' + ['5', '6', '7', '8'].map(function(value) {
                return '<option value="' + value + '"' + (grade === value ? ' selected' : '') + '>' + value + '. sınıf</option>';
            }).join('');
            return '<h3 style="color:#fff;margin:16px 0 8px;">Günlük plan</h3><select id="dosya-gunluk-grade" class="auth-input" onchange="paintDosyaGunluk()">' + options + '</select><div id="dosya-gunluk-list"></div>';
        }
        var rows = [];
        uploads.filter(function(file) { return file.section === section.id && file.slot === slot.id; }).forEach(function(file) {
            rows.push({
                item: { source: 'upload', id: file.id, name: file.name, when: file.when },
                extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="dosyaDelete(\'' + file.id + '\',\'' + section.id + '\')">Sil</button>'
            });
        });
        legacy.forEach(function(file, index) {
            var place = dosyaPlace(file.name, 'auto');
            if (place.section !== section.id || place.slot !== slot.id) return;
            rows.push({ item: { source: 'legacy', id: 'L' + index, sec: section.index, index: index, name: file.name, when: 'Eski yükleme' }, extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="dosyaLegacyDelete(' + section.index + ',' + index + ',\'' + section.id + '\')">Sil</button>' });
        });
        dosyaSystem(section.id, slot.id).forEach(function(item) { rows.push({ item: item }); });
        rows = dosyaSortRows(rows);
        return '<h3 style="color:#fff;margin:16px 0 8px;">' + slot.title + '</h3>' + officeDocTable(rows, true);
    }).join('');
    officeShell(section.title, html, '', 'dosya-sec:' + section.id);
    if (section.id === 'idari') paintDosyaGunluk();
}

function openHomeroom() {
    officeShell('Rehber öğretmen',
        '<select id="home-grade" class="auth-input" onchange="fillHomeBranch()"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="home-branch" class="auth-input" onchange="drawHomeroom()"></select><div id="home-table"></div>',
        '', 'rehber-gor');
    fillHomeBranch();
}
function fillHomeBranch() {
    var grade = document.getElementById('home-grade').value;
    var sel = document.getElementById('home-branch');
    var names = Object.keys((fenData[grade] && fenData[grade].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option>A</option>';
    drawHomeroom();
}
function drawHomeroom() {
    var grade = document.getElementById('home-grade').value;
    var students = officeStudents(grade, document.getElementById('home-branch').value);
    var rows = students.map(function(s) {
        var quizVals = Object.keys(s.quiz || {}).map(function(k) { return parseFloat(s.quiz[k]); }).filter(function(n) { return !isNaN(n); });
        var quiz = quizVals.length ? Math.round(quizVals.reduce(function(a, b) { return a + b; }, 0) / quizVals.length) : '-';
        var scales = Object.keys(s.scale || {}).map(function(k) { return parseFloat((s.scale[k] || {}).totalScore); }).filter(function(n) { return !isNaN(n); });
        var scale = scales.length ? Math.round(scales.reduce(function(a, b) { return a + b; }, 0) / scales.length) : '-';
        return '<tr><td>' + officeEsc(s.no) + '</td><td>' + officeEsc(s.name) + '</td><td>' + quiz + '</td><td>' + scale + '</td></tr>';
    }).join('');
    document.getElementById('home-table').innerHTML = '<table class="data-table"><thead><tr><th>No</th><th>Ad</th><th>Quiz ort.</th><th>Ölçek ort.</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function officeFillBranches(gradeId, branchId) {
    var gradeEl = document.getElementById(gradeId);
    var sel = document.getElementById(branchId);
    if (!gradeEl || !sel) return;
    var names = Object.keys((typeof fenData !== 'undefined' && fenData[gradeEl.value] && fenData[gradeEl.value].branches) || {});
    sel.innerHTML = names.map(function(name) {
        var short = name.indexOf('/') >= 0 ? name.split('/')[1] : name;
        return '<option value="' + officeEsc(short) + '">' + officeEsc(short) + '</option>';
    }).join('') || '<option>A</option>';
}
function openProjeHome() {
    officeShell('Proje ölçeği', officeCards([
        { title: 'Ekle', text: 'Excel şablonunu kaydet', click: "openEvrakScreen('proje-up')" },
        { title: 'E-okul', text: 'Sınıf not listesini kaydet', click: "openEvrakScreen('proje-eokul')" },
        { title: 'Oluştur', text: 'Sınıf, dönem, ölçek', click: "openEvrakScreen('proje-build')" },
        { title: 'Kayıtlı', text: 'İndir, aç, sil', click: "openEvrakScreen('proje-saved')" }
    ]), '', 'proje');
}
function openProjeUpload() {
    var rows = (officeBag().projeTpls || []).map(function(item) {
        return { item: { source: 'none', id: item.id, name: item.name, when: item.when }, extra: '<button class="auth-btn doc-mini" onclick="downloadProjeTpl(\'' + item.id + '\')">İndir</button><button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteProjeTpl(\'' + item.id + '\')">Sil</button>' };
    });
    officeShell('Ölçek ekle',
        '<p style="color:#fff;">Orijinal Excel dosyasını seç. Site dosyayı açıp bozmaz, birebir kaydeder.</p>' +
        '<input id="proje-file" type="file" accept=".xlsx,.xls" class="auth-input">' +
        '<button class="auth-btn" onclick="saveProjeTpl()">Kaydet</button>' + officeDocTable(rows),
        '', 'proje-up');
}
function saveProjeTpl() {
    var input = document.getElementById('proje-file');
    var file = input && input.files && input.files[0];
    if (!file) return alert('Excel seç.');
    if (file.size > 12000000) return alert('Dosya 12 MB üstü.');
    var reader = new FileReader();
    reader.onload = function() {
        var id = 'p' + Date.now().toString(36);
        officeFilePut('proje-tpl-' + id, reader.result).then(function() {
            var bag = officeBag();
            bag.projeTpls = bag.projeTpls || [];
            bag.projeTpls.unshift({ id: id, name: file.name, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            openProjeUpload();
        });
    };
    reader.readAsArrayBuffer(file);
}
function downloadProjeTpl(id) {
    var item = (officeBag().projeTpls || []).filter(function(row) { return row.id === id; })[0];
    officeFileGet('proje-tpl-' + id).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        saveBlob(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), (item && item.name) || 'olcek.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
}
function deleteProjeTpl(id) {
    if (!confirm('Şablon silinsin mi?')) return;
    var bag = officeBag();
    bag.projeTpls = (bag.projeTpls || []).filter(function(row) { return row.id !== id; });
    officeWrite(bag);
    officeFileDel('proje-tpl-' + id).then(function() {
        window._skipHistory = true;
        openProjeUpload();
        window._skipHistory = false;
    });
}
function openProjeBuild() {
    var options = (officeBag().projeTpls || []).map(function(item) {
        return '<option value="' + item.id + '">' + officeEsc(item.name) + '</option>';
    }).join('');
    officeShell('Ölçek oluştur',
        '<p style="color:#fff;">Sınıf, şube ve dönem seç. Notlar, e-okul kartında o sınıf ve dönem için kaydettiğin listeden gelir. Yıl, okul, öğretmen ve müdür başlığa yazılır.</p>' +
        (options ? '<select id="proje-tpl" class="auth-input">' + options + '</select>' : '<p style="color:#fff;">Önce Ekle kartından Excel yükle.</p>') +
        '<select id="proje-grade" class="auth-input" onchange="officeFillBranches(\'proje-grade\',\'proje-branch\')"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="proje-branch" class="auth-input"></select>' +
        '<select id="proje-term" class="auth-input"><option value="1">1. Dönem</option><option value="2">2. Dönem</option></select>' +
        (options ? '<button class="auth-btn" onclick="startProjeSheet()">Aç</button>' : ''),
        '', 'proje-build');
    officeFillBranches('proje-grade', 'proje-branch');
}
function projeEokulHeads() {
    return ['Okul No', 'Adı Soyadı', '1.Sınav', '2.Sınav', '1.Proje', '2.Proje', '1.Ders Et.Kat', '2.Ders Et.Kat', '3.Ders Et.Kat', 'Proje- Ders Etk.Ort.', 'Puanı'];
}
function projeEokulFind(grade, branch, term) {
    return (officeBag().projeEokul || []).filter(function(item) {
        return String(item.grade) === String(grade) && String(item.branch) === String(branch) && String(item.term || '1') === String(term || '1');
    })[0];
}
function openProjeEokul(loadId) {
    var rows = (officeBag().projeEokul || []).map(function(item) {
        return { item: { source: 'none', id: item.id, name: item.grade + '/' + item.branch + ' ' + (item.term === '2' ? '2. dönem' : '1. dönem'), when: (item.students || []).length + ' öğrenci · ' + (item.when || '') }, extra: '<button class="auth-btn doc-mini" onclick="openProjeEokul(\'' + item.id + '\')">Aç</button><button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteProjeEokul(\'' + item.id + '\')">Sil</button>' };
    });
    officeShell('E-okul listesi',
        '<p style="color:#fff;">Sınıf, şube ve dönem seç. E-okul tablosunu başlığıyla birlikte ilk kutuya yapıştır. Kaydet. Oluştur bu listeyi kullanır.</p>' +
        '<select id="eokul-grade" class="auth-input" onchange="officeFillBranches(\'eokul-grade\',\'eokul-branch\')"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="eokul-branch" class="auth-input"></select>' +
        '<select id="eokul-term" class="auth-input"><option value="1">1. Dönem</option><option value="2">2. Dönem</option></select>' +
        '<div class="sheet-wrap" id="proje-eokul-grid"></div>' +
        '<button class="auth-btn" onclick="saveProjeEokul()">Kaydet</button>' + officeDocTable(rows),
        '', loadId ? 'proje-eokul:' + loadId : 'proje-eokul');
    officeFillBranches('eokul-grade', 'eokul-branch');
    var found = (officeBag().projeEokul || []).filter(function(item) { return item.id === loadId; })[0];
    if (found) {
        var gradeEl = document.getElementById('eokul-grade');
        var termEl = document.getElementById('eokul-term');
        if (gradeEl) gradeEl.value = found.grade;
        officeFillBranches('eokul-grade', 'eokul-branch');
        var branchEl = document.getElementById('eokul-branch');
        if (branchEl) branchEl.value = found.branch;
        if (termEl) termEl.value = found.term || '1';
    }
    projeEokulGrid(found ? found.students : []);
}
function projeEokulGrid(students) {
    var host = document.getElementById('proje-eokul-grid');
    if (!host) return;
    var heads = projeEokulHeads();
    var html = '<table class="sheet-grid"><thead><tr>' + heads.map(function(label) { return '<td class="head">' + officeEsc(label) + '</td>'; }).join('') + '</tr></thead><tbody>';
    for (var i = 0; i < 40; i++) {
        var row = (students && students[i]) || [];
        html += '<tr>';
        heads.forEach(function(_, col) {
            html += '<td contenteditable="true">' + officeEsc(row[col] || '') + '</td>';
        });
        html += '</tr>';
    }
    host.innerHTML = html + '</tbody></table>';
    host.onpaste = function(event) {
        var text = event.clipboardData ? (event.clipboardData.getData('text/plain') || event.clipboardData.getData('text')) : '';
        var markup = event.clipboardData ? event.clipboardData.getData('text/html') : '';
        if (!text && !markup) return;
        if (!markup && text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return;
        event.preventDefault();
        var parsed = projeReadPaste(text, markup);
        if (!parsed.length) return alert('Liste okunamadı. E-okul tablosunu başlık satırıyla birlikte seçip kopyala.');
        projeEokulGrid(parsed);
    };
}
function projeEokulRead() {
    var rows = [];
    document.querySelectorAll('#proje-eokul-grid tbody tr').forEach(function(tr) {
        var cells = Array.prototype.map.call(tr.children, function(td) { return (td.innerText || '').replace(/\s+/g, ' ').trim(); });
        if (cells[0] || cells[1]) rows.push(cells);
    });
    return rows;
}
function saveProjeEokul() {
    var grade = document.getElementById('eokul-grade').value;
    var branch = document.getElementById('eokul-branch').value;
    var term = document.getElementById('eokul-term').value || '1';
    var students = projeEokulRead();
    if (!students.length) return alert('Önce e-okul tablosunu yapıştır.');
    var bag = officeBag();
    bag.projeEokul = bag.projeEokul || [];
    var found = projeEokulFind(grade, branch, term);
    if (found) {
        found.students = students;
        found.when = new Date().toLocaleString('tr-TR');
    } else {
        bag.projeEokul.unshift({ id: 'e' + Date.now().toString(36), grade: grade, branch: branch, term: term, students: students, when: new Date().toLocaleString('tr-TR') });
    }
    officeWrite(bag);
    alert('E-okul listesi kaydedildi.');
    openProjeEokul(found ? found.id : bag.projeEokul[0].id);
}
function deleteProjeEokul(id) {
    if (!confirm('E-okul listesi silinsin mi?')) return;
    var bag = officeBag();
    bag.projeEokul = (bag.projeEokul || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    window._skipHistory = true;
    openProjeEokul();
    window._skipHistory = false;
}
function projeFaceKey(name) {
    return String(name || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '');
}
function projeFaceSheets(wb) {
    var order = ['anasayfa', 'dersler', 'proje1', 'proje2', 'dersici1', 'dersici2', 'dersici3'];
    var labels = { anasayfa: 'Anasayfa', dersler: 'Dersler', proje1: '1. Proje', proje2: '2. Proje', dersici1: '1. Ders içi katılım', dersici2: '2. Ders içi katılım', dersici3: '3. Ders içi katılım' };
    return (wb.SheetNames || []).filter(function(name) { return order.indexOf(projeFaceKey(name)) >= 0; }).sort(function(a, b) {
        return order.indexOf(projeFaceKey(a)) - order.indexOf(projeFaceKey(b));
    }).map(function(name) { return { name: name, label: labels[projeFaceKey(name)] || name }; });
}
function projeApplyStudents(students) {
    var wb = window._projeBook;
    if (!wb) return;
    var name = (wb.SheetNames || []).filter(function(item) { return item === 'Eokul'; })[0];
    if (!name) return;
    var model = projeEokulModel(wb.Sheets[name]);
    if (!model) return;
    var slots = model.headers.map(function(header) { return projeNorm(header.label); });
    model.rows.forEach(function(row) {
        model.headers.forEach(function(header) {
            projeWriteCell(name, XLSX.utils.encode_cell({ r: row, c: header.c }), '');
        });
    });
    (students || []).slice(0, model.rows.length).forEach(function(student, index) {
        model.headers.forEach(function(header, col) {
            var key = slots[col];
            var at = ['okulno', 'adisoyadi', '1sinav', '2sinav', '1proje', '2proje', '1dersetkat', '2dersetkat', '3dersetkat', 'projedersetkort', 'puani'].indexOf(key);
            if (at < 0 && key.indexOf('okul') === 0) at = 0;
            if (at < 0 && key.indexOf('soyad') >= 0) at = 1;
            if (at < 0 && key.indexOf('1sinav') >= 0) at = 2;
            if (at < 0 && key.indexOf('2sinav') >= 0) at = 3;
            if (at < 0 && key.indexOf('1proje') >= 0) at = 4;
            if (at < 0 && key.indexOf('2proje') >= 0) at = 5;
            if (at < 0 && key.indexOf('1ders') === 0) at = 6;
            if (at < 0 && key.indexOf('2ders') === 0) at = 7;
            if (at < 0 && key.indexOf('3ders') === 0) at = 8;
            if (at < 0 && key.indexOf('ort') >= 0) at = 9;
            if (at < 0 && key.indexOf('puan') >= 0) at = 10;
            projeWriteCell(name, XLSX.utils.encode_cell({ r: model.rows[index], c: header.c }), at >= 0 ? (student[at] || '') : '');
        });
    });
}
function projeDownload(buffer, name) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    saveBlob(bytes.slice(), name || 'olcek.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function startProjeSheet() {
    var tplEl = document.getElementById('proje-tpl');
    if (!tplEl) return alert('Önce şablon ekle.');
    var tpl = tplEl.value;
    var grade = document.getElementById('proje-grade').value;
    var branch = document.getElementById('proje-branch').value;
    var term = document.getElementById('proje-term').value || '1';
    var list = projeEokulFind(grade, branch, term);
    if (!list || !(list.students || []).length) return alert('Bu sınıf ve dönem için e-okul listesi yok. Önce E-okul kartından yapıştırıp kaydet.');
    officeFileGet('proje-tpl-' + tpl).then(function(buffer) {
        if (!buffer) return alert('Şablon bulunamadı. Ekle kartından orijinal Excel’i yeniden yükle.');
        var bytes = buffer instanceof Uint8Array ? buffer.slice() : new Uint8Array(buffer);
        window._projeBook = XLSX.read(bytes, { type: 'array', cellFormula: true });
        window._projeEdits = {};
        window._projeRaw = bytes;
        window._projeSavedId = null;
        window._projeMeta = { grade: grade, branch: branch, term: term, tpl: tpl, label: grade + '/' + branch + ' ' + (term === '2' ? '2. dönem' : '1. dönem') + ' ölçek' };
        projeApplyStudents(list.students);
        projePrefill(window._projeBook, window._projeMeta);
        showProjeEditor();
    });
}
function showProjeEditor() {
    var wb = window._projeBook;
    if (!wb) return;
    var meta = window._projeMeta || {};
    var faces = projeFaceSheets(wb);
    var preferred = faces.filter(function(item) { return projeFaceKey(item.name) === 'dersici1'; })[0] || faces[0];
    if (!window._projeSheet || wb.SheetNames.indexOf(window._projeSheet) < 0) window._projeSheet = preferred ? preferred.name : wb.SheetNames[0];
    var names = (faces.length ? faces : wb.SheetNames.map(function(name) { return { name: name, label: name }; })).map(function(item) {
        return '<option value="' + wb.SheetNames.indexOf(item.name) + '"' + (item.name === window._projeSheet ? ' selected' : '') + '>' + officeEsc(item.label || item.name) + '</option>';
    }).join('');
    officeShell(meta.label || 'Ölçek',
        '<p style="color:#fff;">Notlar e-okul kaydından geldi. Kaydet demeden kayıtlı ölçek oluşmaz.</p>' +
        '<select id="proje-sheet-pick" class="auth-input" onchange="projeShowSheet(this.value)">' + names + '</select>' +
        '<div class="sheet-wrap" id="proje-grid"></div>' +
        '<button class="auth-btn" onclick="saveProjeSheet()">Kaydet</button><button class="auth-btn" onclick="downloadProjeSheet()">İndir</button>',
        '', window._projeSavedId ? ('proje-sheet:' + window._projeSavedId) : 'proje-build');
    var sec = document.querySelector('#grade-detail-panel .dashboard-content');
    if (sec) sec.style.maxWidth = '100%';
    projeDraw();
}
function openProjeSheet(savedId) {
    if (!window.XLSX) return alert('Sayfayı yenile. Excel motoru yüklenmedi.');
    var saved = (officeBag().projeSaved || []).filter(function(item) { return item.id === savedId; })[0];
    officeFileGet('proje-doc-' + savedId).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        var bytes = buffer instanceof Uint8Array ? buffer.slice() : new Uint8Array(buffer);
        window._projeRaw = bytes;
        window._projeEdits = {};
        window._projeSavedId = savedId;
        window._projeSheet = '';
        window._projeBook = XLSX.read(bytes, { type: 'array', cellFormula: true });
        window._projeMeta = saved ? { grade: saved.grade, branch: saved.branch, term: saved.term || '1', tpl: saved.tpl, label: saved.label } : (window._projeMeta || {});
        if (window._projeMeta.grade) projePrefill(window._projeBook, window._projeMeta);
        showProjeEditor();
    });
}
function projePrefill(wb, info) {
    if (!wb || !wb.Sheets.Anasayfa) return;
    var lesson = (typeof canonicalSubject === 'function' && typeof currentTeacher !== 'undefined' && currentTeacher) ? canonicalSubject(currentTeacher.subject) : ((currentTeacher && currentTeacher.subject) || '');
    var year = (currentTeacher && currentTeacher.academic_year) || (typeof currentPortalYear === 'function' ? currentPortalYear() : '') || localStorage.getItem('fen_academic_year') || '';
    var school = (currentTeacher && currentTeacher.school_name) || localStorage.getItem('fen_school_name') || '';
    var teacher = (currentTeacher && currentTeacher.full_name) || '';
    var principal = officeStaff().principal || '';
    var klass = ((info.grade || '') + (info.branch ? '/' + info.branch : '')).replace(/^\//, '');
    function put(addr, value) {
        var text = String(value || '').trim();
        if (!text) return;
        projeWriteCell('Anasayfa', addr, text.toLocaleUpperCase('tr-TR'));
    }
    put('E5', year);
    put('H6', info.term === '2' ? '2.DÖNEM' : '1.DÖNEM');
    put('E7', school);
    put('E8', principal);
    put('E9', 'OKUL MÜDÜRÜ');
    put('E10', lesson);
    put('E11', teacher);
    put('E12', lesson ? lesson + ' ÖĞRETMENİ' : '');
    put('E13', klass);
}
function projeRemember(sheet, addr, value) {
    window._projeEdits = window._projeEdits || {};
    window._projeEdits[sheet] = window._projeEdits[sheet] || {};
    window._projeEdits[sheet][addr] = value;
}
function projeBox(ws) {
    var minR = 9999, maxR = 0, minC = 9999, maxC = 0, any = false;
    Object.keys(ws || {}).forEach(function(addr) {
        if (addr.charAt(0) === '!') return;
        var cell = ws[addr];
        if (!cell || (cell.v == null && cell.v !== 0 && !cell.f)) return;
        if (!cell.f && String(cell.v || '').length > 140) return;
        var pos = XLSX.utils.decode_cell(addr);
        any = true;
        if (pos.r < minR) minR = pos.r;
        if (pos.r > maxR) maxR = pos.r;
        if (pos.c < minC) minC = pos.c;
        if (pos.c > maxC) maxC = pos.c;
    });
    if (!any) return { s: { r: 0, c: 0 }, e: { r: 12, c: 6 } };
    return { s: { r: minR, c: minC }, e: { r: Math.min(maxR, minR + 75), c: Math.min(maxC, minC + 28) } };
}
function projeText(ws, addr) {
    var cell = ws && ws[addr];
    if (!cell || cell.v == null) return '';
    return String(cell.v).replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}
function projeWriteCell(sheetName, addr, value) {
    var wb = window._projeBook;
    var ws = wb && wb.Sheets[sheetName];
    if (!ws) return;
    var raw = String(value == null ? '' : value).trim();
    if (!raw) delete ws[addr];
    else if (/^-?\d+([.,]\d+)?$/.test(raw)) ws[addr] = { t: 'n', v: parseFloat(raw.replace(',', '.')) };
    else ws[addr] = { t: 's', v: raw };
    projeRemember(sheetName, addr, raw);
}
function projeEokulModel(ws) {
    var header = -1;
    var start = -1;
    for (var r = 0; r < 15 && header < 0; r++) {
        for (var c = 0; c < 20; c++) {
            var label = projeText(ws, XLSX.utils.encode_cell({ r: r, c: c })).toLocaleLowerCase('tr-TR');
            if (label === 'okul no') { header = r; start = c; break; }
        }
    }
    if (header < 0) return null;
    var headers = [];
    for (var col = start; col < start + 14; col++) {
        var name = projeText(ws, XLSX.utils.encode_cell({ r: header, c: col }));
        if (!name) { if (headers.length) break; continue; }
        headers.push({ c: col, label: name });
    }
    var step = 1;
    var dataRow = header + 1;
    (ws['!merges'] || []).some(function(merge) {
        if (merge.s.r === dataRow && merge.e.r > merge.s.r && merge.s.c >= start && merge.s.c < start + Math.max(headers.length, 1)) {
            step = merge.e.r - merge.s.r + 1;
            return true;
        }
    });
    var rows = [];
    for (var i = 0; i < 40; i++) rows.push(header + 1 + i * step);
    return { headers: headers, rows: rows };
}
function projeNorm(value) {
    return String(value || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
}
function projeCellPlain(td) {
    var picked = '';
    Array.prototype.forEach.call(td.querySelectorAll('input, textarea'), function(input) {
        var value = (input.getAttribute('value') || input.value || '').trim();
        if (!picked && value) picked = value;
    });
    Array.prototype.forEach.call(td.querySelectorAll('select'), function(sel) {
        var opt = sel.querySelector('option[selected]') || (sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null);
        var value = opt ? (opt.textContent || '').trim() : '';
        if (!picked && value) picked = value;
    });
    if (!picked) {
        var attr = (td.innerHTML || '').match(/value="([^"]*)"/i);
        if (attr && attr[1].trim()) picked = attr[1].trim();
    }
    var text = (td.innerText || td.textContent || '').replace(/\u00a0/g, ' ').replace(/öğrenci not bilgisi/ig, '').replace(/\s+/g, ' ').trim();
    var parts = text.split(' ').filter(Boolean);
    if (parts.length > 1 && parts.every(function(part) { return part === parts[0]; })) text = parts[0];
    if (picked && /^(\d+([.,]\d+)?|[GMK])$/i.test(picked)) return picked;
    if (text) return text;
    return picked;
}
function projeHtmlRows(html) {
    if (!html || typeof DOMParser === 'undefined') return [];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tables = Array.prototype.slice.call(doc.querySelectorAll('table'));
    if (!tables.length) return [];
    var table = tables.filter(function(item) { return /okul\s*no/i.test(item.textContent || ''); })[0] || tables[0];
    var rows = [];
    table.querySelectorAll('tr').forEach(function(tr) {
        if (tr.parentElement && tr.parentElement.closest && tr.parentElement.closest('table') !== table) return;
        var cells = [];
        Array.prototype.forEach.call(tr.children, function(td) {
            if (td.tagName !== 'TD' && td.tagName !== 'TH') return;
            var text = projeCellPlain(td);
            var span = parseInt(td.getAttribute('colspan') || '1', 10) || 1;
            cells.push(text);
            for (var extra = 1; extra < span; extra++) cells.push('');
        });
        if (cells.some(function(item) { return item; })) rows.push(cells);
    });
    return rows;
}
function projePlainRows(text) {
    return String(text || '').replace(/\r/g, '').split('\n').filter(function(line) { return line.trim(); }).map(function(line) {
        return line.split('\t').map(function(item) { return item.replace(/\u00a0/g, ' ').replace(/öğrenci not bilgisi/ig, '').trim(); });
    });
}
function projeGradeCount(list) {
    var count = 0;
    (list || []).forEach(function(row) {
        for (var i = 2; i < row.length; i++) if (row[i]) count++;
    });
    return count;
}
function projeReadPaste(text, markup) {
    var plain = projePlainRows(text);
    var plainWidth = plain.reduce(function(max, row) { return Math.max(max, row.length); }, 0);
    var fromPlain = plainWidth >= 8 ? projeTakeStudents(plain) : [];
    var fromHtml = projeTakeStudents(projeHtmlRows(markup));
    if (projeGradeCount(fromHtml) > projeGradeCount(fromPlain)) return fromHtml;
    if (fromPlain.length) return fromPlain;
    if (fromHtml.length) return fromHtml;
    return projeTakeStudents(plain);
}
function projeTakeStudents(rows) {
    var order = ['okulno', 'adisoyadi', '1sinav', '2sinav', '1proje', '2proje', '1dersetkat', '2dersetkat', '3dersetkat', 'projedersetkort', 'puani'];
    function slot(key) {
        var at = order.indexOf(key);
        if (at >= 0) return at;
        if (key.indexOf('okul') === 0) return 0;
        if (key.indexOf('soyad') >= 0 || key.indexOf('adisoy') >= 0) return 1;
        if (key.indexOf('1sinav') >= 0) return 2;
        if (key.indexOf('2sinav') >= 0) return 3;
        if (key.indexOf('1proje') >= 0) return 4;
        if (key.indexOf('2proje') >= 0) return 5;
        if (key.indexOf('1ders') === 0) return 6;
        if (key.indexOf('2ders') === 0) return 7;
        if (key.indexOf('3ders') === 0) return 8;
        if (key.indexOf('ort') >= 0) return 9;
        if (key.indexOf('puan') >= 0) return 10;
        return -1;
    }
    var headerIndex = -1;
    rows.forEach(function(row, index) {
        var keys = row.map(projeNorm);
        if (headerIndex < 0 && keys.indexOf('okulno') >= 0) headerIndex = index;
    });
    var header = headerIndex >= 0 ? rows[headerIndex].map(projeNorm) : null;
    var merged = [];
    rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0).forEach(function(row) {
        var clean = row.map(function(item) { return /öğrenci not bilgisi/i.test(item) ? '' : item; });
        var out = order.map(function() { return ''; });
        if (header) header.forEach(function(key, index) { var at = slot(key); if (at >= 0 && clean[index]) out[at] = clean[index]; });
        else order.forEach(function(_, index) { out[index] = clean[index] || ''; });
        if (/^\d{1,6}$/.test(String(out[0]).trim()) && out[1]) merged.push(out);
    });
    return merged;
}
function projeEokulDraw() {
    var wb = window._projeBook;
    var host = document.getElementById('proje-grid');
    var name = window._projeSheet;
    var model = projeEokulModel(wb.Sheets[name]);
    if (!host || !model) return projePlainDraw();
    var html = '<p style="color:#9a3412;background:#fff;margin:0;padding:8px 10px;">E-okul tablosunu başlığıyla birlikte kopyala, ilk kutuya yapıştır. Okul no ve ad aynı satırda kalır, not kendi sütununa oturur.</p><table class="sheet-grid"><thead><tr>';
    model.headers.forEach(function(header) { html += '<td class="head">' + officeEsc(header.label) + '</td>'; });
    html += '</tr></thead><tbody>';
    model.rows.forEach(function(row, index) {
        html += '<tr>';
        model.headers.forEach(function(header, colIndex) {
            var addr = XLSX.utils.encode_cell({ r: row, c: header.c });
            html += '<td contenteditable="true" class="' + (colIndex === 1 ? 'name' : (index === 0 && colIndex === 0 ? 'paste' : '')) + '" data-addr="' + addr + '" data-row="' + index + '" data-col="' + colIndex + '">' + officeEsc(projeText(wb.Sheets[name], addr)) + '</td>';
        });
        html += '</tr>';
    });
    host.innerHTML = html + '</tbody></table>';
    host.querySelectorAll('td[data-addr]').forEach(function(td) {
        td.addEventListener('input', function() {
            projeWriteCell(name, td.getAttribute('data-addr'), td.innerText);
        });
    });
    host.onpaste = function(event) {
        var text = event.clipboardData ? (event.clipboardData.getData('text/plain') || event.clipboardData.getData('text')) : '';
        var markup = event.clipboardData ? event.clipboardData.getData('text/html') : '';
        if (!text && !markup) return;
        if (!markup && text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return;
        event.preventDefault();
        var parsed = projeReadPaste(text, markup);
        if (!parsed.length) return alert('Liste okunamadı. E-okul tablosunu başlık satırıyla birlikte seçip kopyala.');
        model.rows.forEach(function(row) {
            model.headers.forEach(function(header) {
                projeWriteCell(name, XLSX.utils.encode_cell({ r: row, c: header.c }), '');
            });
        });
        var slots = model.headers.map(function(header) { return projeNorm(header.label); });
        parsed.slice(0, model.rows.length).forEach(function(student, index) {
            model.headers.forEach(function(header, col) {
                var key = slots[col];
                var at = ['okulno', 'adisoyadi', '1sinav', '2sinav', '1proje', '2proje', '1dersetkat', '2dersetkat', '3dersetkat', 'projedersetkort', 'puani'].indexOf(key);
                if (at < 0 && key.indexOf('okul') === 0) at = 0;
                if (at < 0 && key.indexOf('soyad') >= 0) at = 1;
                if (at < 0 && key.indexOf('1sinav') >= 0) at = 2;
                if (at < 0 && key.indexOf('2sinav') >= 0) at = 3;
                if (at < 0 && key.indexOf('1proje') >= 0) at = 4;
                if (at < 0 && key.indexOf('2proje') >= 0) at = 5;
                if (at < 0 && key.indexOf('1ders') === 0) at = 6;
                if (at < 0 && key.indexOf('2ders') === 0) at = 7;
                if (at < 0 && key.indexOf('3ders') === 0) at = 8;
                if (at < 0 && key.indexOf('ort') >= 0) at = 9;
                if (at < 0 && key.indexOf('puan') >= 0) at = 10;
                projeWriteCell(name, XLSX.utils.encode_cell({ r: model.rows[index], c: header.c }), at >= 0 ? (student[at] || '') : '');
            });
        });
        projeEokulDraw();
        saveProjeSheet(true);
    };
}
function projeFormulaText(wb, formula) {
    var match = String(formula || '').match(/^'?([^'!]+)'?!(\$?[A-Z]+\$?\d+)$/);
    if (!match || !wb.Sheets[match[1]]) return '';
    return projeText(wb.Sheets[match[1]], match[2].replace(/\$/g, ''));
}
function projeScoreModel(wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) return null;
    var hits = [];
    Object.keys(ws).forEach(function(addr) {
        var cell = ws[addr];
        if (!cell || !cell.f) return;
        var match = cell.f.match(/'?([^'!]+)'?!C(\d+)$/i);
        if (!match || !/eokul/i.test(match[1])) return;
        hits.push({ row: XLSX.utils.decode_cell(addr).r, eokulRow: parseInt(match[2], 10), sheet: match[1] });
    });
    if (hits.length < 2) return null;
    hits.sort(function(a, b) { return a.row - b.row; });
    var top = hits[0];
    var fields = [];
    Object.keys(ws).forEach(function(addr) {
        var cell = ws[addr];
        if (!cell || !cell.f) return;
        var pos = XLSX.utils.decode_cell(addr);
        if (pos.r !== top.row) return;
        var ref = cell.f.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)$/);
        var eokulCol = ref && /eokul/i.test(ref[1]) ? ref[2] : '';
        var veri = ref && /veri/i.test(ref[1]) ? { sheet: ref[1], col: ref[2], row: ref[3] } : null;
        fields.push({ c: pos.c, eokulCol: eokulCol, veri: veri });
    });
    fields.sort(function(a, b) { return a.c - b.c; });
    var scoreCol = '';
    var crits = [];
    fields.forEach(function(field) {
        if (!field.eokulCol || field.eokulCol === 'B' || field.eokulCol === 'C' || scoreCol) return;
        scoreCol = field.eokulCol;
    });
    fields.forEach(function(field) {
        if (!field.veri) return;
        var label = '';
        for (var r = top.row - 1; r >= 0; r--) {
            var up = ws[XLSX.utils.encode_cell({ r: r, c: field.c })];
            if (up && up.f && up.f.indexOf('!') >= 0 && !/Veri|Eokul/i.test(up.f)) { label = projeFormulaText(wb, up.f); break; }
        }
        var veriCell = wb.Sheets[field.veri.sheet] && wb.Sheets[field.veri.sheet][field.veri.col + field.veri.row];
        var cutMatch = veriCell && veriCell.f ? String(veriCell.f).match(/-(\d+)\s*>/) : null;
        field.cut = cutMatch ? parseInt(cutMatch[1], 10) : 0;
        field.label = label || ('Ölçüt ' + (crits.length + 1));
        crits.push({ label: field.label, cut: field.cut });
    });
    if (!scoreCol || !crits.length) return null;
    return { eokul: top.sheet, rows: hits.map(function(hit) { return hit.eokulRow; }), faceRows: hits.map(function(hit) { return hit.row; }), scoreCol: scoreCol, crits: crits, fields: fields };
}
function projeSpread(score, cut) {
    var number = parseFloat(String(score).replace(',', '.'));
    if (!isFinite(number) || number <= 0) return '';
    var base = 0;
    var rest = number;
    if (number >= 100) { base = 4; rest = 20; }
    else if (number > 80) { base = 4; rest = number - 80; }
    else if (number > 60) { base = 3; rest = number - 60; }
    else if (number > 40) { base = 2; rest = number - 40; }
    else if (number > 20) { base = 1; rest = number - 20; }
    else rest = number;
    return String(rest - cut > 0 ? base + 1 : base);
}
function projeScoreDraw(model) {
    var host = document.getElementById('proje-grid');
    var eokul = window._projeBook.Sheets[model.eokul];
    if (!host || !eokul) return projePlainDraw();
    var html = '<p style="color:#9a3412;background:#fff;margin:0;padding:8px 10px;">Notlar E-okul sayfasından gelir. Her ölçüt, yapıştırdığın puana göre dolar. Burada değiştirilmez.</p><table class="sheet-grid"><thead><tr><td class="head">No</td><td class="head">Adı Soyadı</td>';
    model.crits.forEach(function(crit) { html += '<td class="head">' + officeEsc(crit.label) + '</td>'; });
    html += '<td class="head">Puan</td></tr></thead><tbody>';
    var any = false;
    model.rows.forEach(function(row) {
        var no = projeText(eokul, 'B' + row);
        var student = projeText(eokul, 'C' + row);
        var score = projeGrade(eokul, model.scoreCol, row);
        if (!no && !student && !score) return;
        any = true;
        html += '<tr><td class="formula">' + officeEsc(no) + '</td><td class="formula">' + officeEsc(student) + '</td>';
        model.crits.forEach(function(crit) { html += '<td class="formula">' + projeSpread(score, crit.cut) + '</td>'; });
        html += '<td class="formula">' + officeEsc(score) + '</td></tr>';
    });
    if (!any) html += '<tr><td class="formula" colspan="' + (model.crits.length + 3) + '">Henüz not yok. Eokul sayfasına yapıştır.</td></tr>';
    host.innerHTML = html + '</tbody></table>';
}
function projePlainDraw() {
    var wb = window._projeBook;
    var host = document.getElementById('proje-grid');
    if (!wb || !host) return;
    var name = window._projeSheet || wb.SheetNames[0];
    var ws = wb.Sheets[name];
    if (!ws) { host.innerHTML = ''; return; }
    var range = projeBox(ws);
    var span = {};
    (ws['!merges'] || []).forEach(function(merge) {
        if (merge.e.r < range.s.r || merge.s.r > range.e.r || merge.e.c < range.s.c || merge.s.c > range.e.c) return;
        var r0 = Math.max(merge.s.r, range.s.r);
        var c0 = Math.max(merge.s.c, range.s.c);
        var r1 = Math.min(merge.e.r, range.e.r);
        var c1 = Math.min(merge.e.c, range.e.c);
        span[r0 + ',' + c0] = { rs: r1 - r0 + 1, cs: c1 - c0 + 1 };
        for (var rr = r0; rr <= r1; rr++) {
            for (var cc = c0; cc <= c1; cc++) {
                if (rr !== r0 || cc !== c0) span[rr + ',' + cc] = { hide: true };
            }
        }
    });
    var html = '<table class="sheet-grid"><tbody>';
    for (var r = range.s.r; r <= range.e.r; r++) {
        html += '<tr>';
        for (var c = range.s.c; c <= range.e.c; c++) {
            var mark = span[r + ',' + c];
            if (mark && mark.hide) continue;
            var addr = XLSX.utils.encode_cell({ r: r, c: c });
            var cell = ws[addr];
            var lock = cell && cell.f ? '1' : '0';
            var shown = cell ? String(cell.w != null ? cell.w : (cell.v != null ? cell.v : '')) : '';
            var extra = mark && mark.rs > 1 ? ' rowspan="' + mark.rs + '"' : '';
            extra += mark && mark.cs > 1 ? ' colspan="' + mark.cs + '"' : '';
            html += '<td data-addr="' + addr + '" data-lock="' + lock + '"' + extra + (lock === '1' ? ' class="formula"' : ' contenteditable="true"') + '>' + officeEsc(shown) + '</td>';
        }
        html += '</tr>';
    }
    host.innerHTML = html + '</tbody></table>';
    host.querySelectorAll('td[data-lock="0"]').forEach(function(td) {
        td.addEventListener('input', function() {
            var value = td.innerText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
            var addr = td.getAttribute('data-addr');
            ws[addr] = { t: 's', v: value };
            projeRemember(name, addr, value);
        });
    });
}
function projeDraw() {
    var wb = window._projeBook;
    if (!wb) return;
    var name = window._projeSheet || wb.SheetNames[0];
    window._projeSheet = name;
    var pick = document.getElementById('proje-sheet-pick');
    if (pick) pick.value = String(wb.SheetNames.indexOf(name));
    if (/eokul/i.test(name)) return projeEokulDraw();
    var score = projeScoreModel(wb, name);
    if (score) return projeScoreDraw(score);
    projePlainDraw();
}
function projeShowSheet(index) {
    var wb = window._projeBook;
    if (!wb) return;
    window._projeSheet = wb.SheetNames[parseInt(index, 10)] || wb.SheetNames[0];
    projeDraw();
}
function projeXmlEscape(text) {
    return String(text == null ? '' : text).replace(/&/g, '&' + 'amp;').replace(/</g, '&' + 'lt;').replace(/>/g, '&' + 'gt;');
}
function projePatch(bytes, edits) {
    if (!window.fflate) throw new Error('fflate');
    var files = fflate.unzipSync(bytes);
    var decoder = new TextDecoder();
    var encoder = new TextEncoder();
    var wbXml = decoder.decode(files['xl/workbook.xml']);
    var rels = decoder.decode(files['xl/_rels/workbook.xml.rels']);
    var sheets = [];
    wbXml.replace(/<sheet\b[^>]*>/g, function(tag) {
        var name = (tag.match(/name="([^"]+)"/) || [])[1];
        var id = (tag.match(/r:id="([^"]+)"/) || [])[1];
        var rel = rels.match(new RegExp('Id="' + id + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + id + '"'));
        if (!name || !rel) return;
        var target = rel[1].replace(/^\//, '');
        if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\.\//, '');
        sheets.push({ name: name, path: target });
    });
    var ssPath = 'xl/sharedStrings.xml';
    var ss = decoder.decode(files[ssPath]);
    var strings = [];
    ss.replace(/<si\b[\s\S]*?<\/si>/g, function(block) { strings.push(block); return block; });
    function addString(text) {
        strings.push('<si><t xml:space="preserve">' + projeXmlEscape(text) + '</t></si>');
        return strings.length - 1;
    }
    Object.keys(edits || {}).forEach(function(sheetName) {
        var sheet = null;
        sheets.forEach(function(item) { if (item.name === sheetName) sheet = item; });
        if (!sheet || !files[sheet.path]) return;
        var xml = decoder.decode(files[sheet.path]);
        Object.keys(edits[sheetName]).forEach(function(addr) {
            var value = edits[sheetName][addr];
            var numeric = /^-?\d+([.,]\d+)?$/.test(value);
            var inner = numeric ? '<v>' + value.replace(',', '.') + '</v>' : '<v>' + addString(value) + '</v>';
            var re = new RegExp('<c r="' + addr + '"([^>/]*)(?:/>|>([\\s\\S]*?)</c>)');
            var found = xml.match(re);
            if (found) {
                var attrs = (found[1] || '').replace(/\s+t="[^"]*"/g, '');
                if (!numeric) attrs += ' t="s"';
                xml = xml.replace(found[0], '<c r="' + addr + '"' + attrs + '>' + inner + '</c>');
                return;
            }
            var row = addr.replace(/^[A-Z]+/, '');
            var cellXml = '<c r="' + addr + '"' + (numeric ? '' : ' t="s"') + '>' + inner + '</c>';
            var rowRe = new RegExp('(<row\\b[^>]*r="' + row + '"[^>]*>)([\\s\\S]*?)(</row>)');
            if (rowRe.test(xml)) xml = xml.replace(rowRe, function(all, open, body, close) { return open + body + cellXml + close; });
            else xml = xml.replace('</sheetData>', '<row r="' + row + '">' + cellXml + '</row></sheetData>');
        });
        files[sheet.path] = encoder.encode(xml);
    });
    var count = strings.length;
    var open = (ss.match(/<sst\b[^>]*>/) || ['<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'])[0];
    if (!/count="/.test(open)) open = open.replace('<sst', '<sst count="' + count + '" uniqueCount="' + count + '"');
    else open = open.replace(/count="\d+"/, 'count="' + count + '"').replace(/uniqueCount="\d+"/, 'uniqueCount="' + count + '"');
    var head = ss.slice(0, ss.indexOf('<sst'));
    files[ssPath] = encoder.encode(head + open + strings.join('') + '</sst>');
    return fflate.zipSync(files);
}
function saveProjeSheet(silent, done) {
    if (!window._projeRaw) { if (done) done(); return; }
    if (silent && !window._projeSavedId) { if (done) done(); return; }
    var edits = window._projeEdits || {};
    var has = Object.keys(edits).some(function(name) { return Object.keys(edits[name] || {}).length; });
    var bytes;
    try {
        bytes = has ? projePatch(window._projeRaw, edits) : window._projeRaw;
    } catch (err) {
        if (!silent) alert('Kaydedilemedi. Sayfayı yenileyip tekrar dene.');
        if (done) done();
        return;
    }
    var meta = window._projeMeta || {};
    var existing = (officeBag().projeSaved || []).filter(function(item) { return item.id === window._projeSavedId; })[0];
    try { bytes = projeBakeBytes(bytes, projeInfoNow(existing || meta)); }
    catch (err2) {}
    var id = window._projeSavedId || ('s' + Date.now().toString(36));
    officeFilePut('proje-doc-' + id, bytes).then(function() {
        window._projeRaw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        window._projeEdits = {};
        window._projeSavedId = id;
        var bag = officeBag();
        bag.projeSaved = bag.projeSaved || [];
        var found = false;
        bag.projeSaved.forEach(function(item) {
            if (item.id !== id) return;
            found = true;
            item.when = new Date().toLocaleString('tr-TR');
        });
        if (!found) bag.projeSaved.unshift({ id: id, label: meta.label || 'Ölçek', grade: meta.grade, branch: meta.branch, term: meta.term || '1', tpl: meta.tpl, when: new Date().toLocaleString('tr-TR') });
        officeWrite(bag);
        if (!silent) alert('Ölçek kaydedildi.');
        if (done) done();
    });
}
function projePuanCol(ws) {
    if (!ws || !ws['!ref'] || !window.XLSX) return '';
    var range = XLSX.utils.decode_range(ws['!ref']);
    for (var r = range.s.r; r <= Math.min(range.e.r, range.s.r + 6); r++) {
        for (var c = range.s.c; c <= Math.min(range.e.c, 16); c++) {
            if (projeNorm(projeText(ws, XLSX.utils.encode_cell({ r: r, c: c }))) === 'puani') return XLSX.utils.encode_col(c);
        }
    }
    return '';
}
function projeGrade(ws, col, row) {
    return projeText(ws, col + row);
}
function projeCalcExpr(wb, sheet, expr, seen) {
    expr = String(expr || '').trim();
    if (/^IF\(/i.test(expr)) return projeCalcIf(wb, sheet, expr, seen);
    if (/^"[\s\S]*"$/.test(expr)) return expr.slice(1, -1);
    if (/^-?\d+([.,]\d+)?$/.test(expr)) return parseFloat(expr.replace(',', '.'));
    if (/^[A-Z]+\d+$/.test(expr)) return projeCalc(wb, sheet, expr, seen);
    var ref = expr.match(/^'([^']+)'!([A-Z]+\d+)$/) || expr.match(/^([^!]+)!([A-Z]+\d+)$/);
    if (ref) return projeCalc(wb, ref[1], ref[2], seen);
    var op = expr.match(/^(.+?)\s*([+\-])\s*(.+)$/);
    if (op) {
        var left = parseFloat(String(projeCalcExpr(wb, sheet, op[1], seen)).replace(',', '.'));
        var right = parseFloat(String(projeCalcExpr(wb, sheet, op[3], seen)).replace(',', '.'));
        if (!isFinite(left) || !isFinite(right)) return '';
        return op[2] === '-' ? left - right : left + right;
    }
    return '';
}
function projeCalcCond(wb, sheet, expr, seen) {
    var match = String(expr || '').match(/^(.+?)(>=|<=|<>|=|>|<)(.+)$/);
    if (!match) return false;
    var left = projeCalcExpr(wb, sheet, match[1], seen);
    var right = projeCalcExpr(wb, sheet, match[3], seen);
    var ln = parseFloat(String(left).replace(',', '.'));
    var rn = parseFloat(String(right).replace(',', '.'));
    left = isFinite(ln) ? ln : left;
    right = isFinite(rn) ? rn : right;
    if (match[2] === '=') return left == right;
    if (match[2] === '>') return left > right;
    if (match[2] === '<') return left < right;
    if (match[2] === '>=') return left >= right;
    if (match[2] === '<=') return left <= right;
    return left != right;
}
function projeCalcIf(wb, sheet, formula, seen) {
    var inner = String(formula).trim().replace(/^IF\(/i, '').replace(/\)$/, '');
    var args = [];
    var depth = 0;
    var cur = '';
    for (var i = 0; i < inner.length; i++) {
        var ch = inner.charAt(i);
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
        cur += ch;
    }
    args.push(cur);
    if (args.length < 3) return '';
    return projeCalcExpr(wb, sheet, projeCalcCond(wb, sheet, args[0], seen) ? args[1] : args[2], seen);
}
function projeCalc(wb, sheet, addr, seen) {
    seen = seen || {};
    var key = sheet + '!' + addr;
    if (seen[key]) return '';
    var ws = wb.Sheets[sheet];
    var cell = ws && ws[addr];
    if (!cell) return '';
    if (!cell.f) return cell.v == null ? '' : cell.v;
    seen[key] = 1;
    var formula = String(cell.f).replace(/\$/g, '');
    if (/^CONCATENATE\(/i.test(formula)) {
        var inner = formula.replace(/^CONCATENATE\(/i, '').replace(/\)$/, '');
        var args = [];
        var depth = 0;
        var cur = '';
        for (var i = 0; i < inner.length; i++) {
            var ch = inner.charAt(i);
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
            cur += ch;
        }
        args.push(cur);
        return args.map(function(part) { return projeCalcExpr(wb, sheet, part, seen); }).join('');
    }
    var ref = formula.match(/^'?([^'!]+)'?!([A-Z]+\d+)$/);
    if (ref) return projeCalc(wb, ref[1], ref[2], seen);
    if (/^IF\(/i.test(formula)) return projeCalcIf(wb, sheet, formula, seen);
    return cell.v == null ? '' : cell.v;
}
function projeCacheCell(addr, attrs, inner, value) {
    var text = String(value == null ? '' : value).trim();
    var numeric = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(text.replace(',', '.'));
    var shown = numeric ? text.replace(',', '.') : projeXmlEscape(text);
    var next = String(attrs || '').replace(/\s+t="[^"]*"/g, '') + (numeric ? '' : ' t="str"');
    if (!inner) return '<c r="' + addr + '"' + next + '><v>' + shown + '</v></c>';
    var body = inner.replace(/<v\b[^>]*>[\s\S]*?<\/v>/, '');
    if (body.indexOf('</f>') >= 0) body = body.replace('</f>', '</f><v>' + shown + '</v>');
    else body += '<v>' + shown + '</v>';
    return '<c r="' + addr + '"' + next + '>' + body + '</c>';
}
function projeInfoNow(saved) {
    var lesson = (typeof canonicalSubject === 'function' && typeof currentTeacher !== 'undefined' && currentTeacher) ? canonicalSubject(currentTeacher.subject) : ((currentTeacher && currentTeacher.subject) || '');
    var year = (currentTeacher && currentTeacher.academic_year) || (typeof currentPortalYear === 'function' ? currentPortalYear() : '') || localStorage.getItem('fen_academic_year') || '';
    var school = (currentTeacher && currentTeacher.school_name) || localStorage.getItem('fen_school_name') || '';
    var teacher = (currentTeacher && currentTeacher.full_name) || '';
    var principal = officeStaff().principal || '';
    var term = saved && saved.term === '2' ? '2.DÖNEM' : '1.DÖNEM';
    var klass = saved ? ((saved.grade || '') + (saved.branch ? '/' + saved.branch : '')).replace(/^\//, '') : '';
    return {
        year: String(year || '').toLocaleUpperCase('tr-TR'),
        school: String(school || '').toLocaleUpperCase('tr-TR'),
        teacher: String(teacher || '').toLocaleUpperCase('tr-TR'),
        principal: String(principal || '').toLocaleUpperCase('tr-TR'),
        lesson: String(lesson || '').toLocaleUpperCase('tr-TR'),
        title: lesson ? (String(lesson).toLocaleUpperCase('tr-TR') + ' ÖĞRETMENİ') : '',
        term: term,
        klass: String(klass || '').toLocaleUpperCase('tr-TR')
    };
}
function projeSyncSource(saved) {
    var wb = window._projeBook;
    if (!wb) return;
    if (saved) projePrefill(wb, saved);
    var eokulName = (wb.SheetNames || []).filter(function(item) { return item === 'Eokul'; })[0];
    var eokul = eokulName && wb.Sheets[eokulName];
    if (eokul) {
        Object.keys(eokul).forEach(function(addr) {
            if (addr.charAt(0) === '!') return;
            var cell = eokul[addr];
            if (!cell || cell.f || cell.v == null || cell.v === '') return;
            projeRemember(eokulName, addr, cell.v);
        });
    }
}
function projePaintSheet(xml, wb, sheetName, info) {
    var model = projeScoreModel(wb, sheetName);
    var values = {};
    if (model && model.faceRows) {
        var eokul = wb.Sheets[model.eokul];
        model.faceRows.forEach(function(faceRow, index) {
            var eRow = model.rows[index];
            var no = projeText(eokul, 'B' + eRow);
            var student = projeText(eokul, 'C' + eRow);
            var score = projeGrade(eokul, model.scoreCol, eRow);
            (model.fields || []).forEach(function(field) {
                var addr = XLSX.utils.encode_cell({ r: faceRow, c: field.c });
                var value = '';
                if (field.eokulCol === 'B') value = no;
                else if (field.eokulCol === 'C') value = student;
                else if (field.eokulCol && field.eokulCol === model.scoreCol) value = score;
                else if (field.veri) value = projeSpread(score, field.cut || 0);
                if (value !== '' && value != null) values[addr] = value;
            });
        });
    }
    info = info || {};
    var out = '';
    var cursor = 0;
    var mark = '<c r="';
    while (cursor < xml.length) {
        var at = xml.indexOf(mark, cursor);
        if (at < 0) { out += xml.slice(cursor); break; }
        out += xml.slice(cursor, at);
        var q2 = xml.indexOf('"', at + mark.length);
        if (q2 < 0) { out += xml.slice(at); break; }
        var addr = xml.slice(at + mark.length, q2);
        var gt = xml.indexOf('>', q2);
        if (gt < 0) { out += xml.slice(at); break; }
        var self = xml.charAt(gt - 1) === '/';
        var attrs = xml.slice(q2 + 1, self ? gt - 1 : gt);
        var inner = '';
        var end = gt + 1;
        if (!self) {
            var close = xml.indexOf('</c>', gt);
            if (close < 0) { out += xml.slice(at); break; }
            inner = xml.slice(gt + 1, close);
            end = close + 4;
        }
        var value = values[addr];
        if ((value == null || value === '') && inner.indexOf('<f') >= 0) {
            var formula = (inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || ['', ''])[1];
            if (info.year && formula.indexOf('Anasayfa!E5') >= 0 && /CONCATENATE/i.test(formula)) value = (info.year + '  EĞİTİM ÖĞRETİM YILI ' + (info.school || '')).trim();
            else if (info.klass && formula.indexOf('Anasayfa!E13') >= 0) value = info.klass;
            else if (info.principal && formula.indexOf('Anasayfa!E8') >= 0) value = info.principal;
            else if (info.teacher && formula.indexOf('Anasayfa!E11') >= 0) value = info.teacher;
            else if (info.title && formula.indexOf('Anasayfa!E12') >= 0) value = info.title;
            else if (info.lesson && formula.indexOf('Anasayfa!E10') >= 0 && /CONCATENATE/i.test(formula)) value = (info.lesson + ' DERSİ ' + (info.term || '') + ' ' + ((formula.match(/"([^"]*ÖLÇEĞİ)"/) || ['', ''])[1])).replace(/\s+/g, ' ').trim();
        }
        if (value == null || value === '') out += xml.slice(at, end);
        else out += projeCacheCell(addr, attrs, inner, value);
        cursor = end;
    }
    return out;
}
function projeBakeBytes(bytes, info) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!window.fflate || !window.XLSX) return bytes;
    info = info || {};
    var head = { Anasayfa: {} };
    function put(addr, value) {
        var text = String(value || '').trim();
        if (text) head.Anasayfa[addr] = text;
    }
    put('E5', info.year);
    put('H6', info.term);
    put('E7', info.school);
    put('E8', info.principal);
    put('E9', 'OKUL MÜDÜRÜ');
    put('E10', info.lesson);
    put('E11', info.teacher);
    put('E12', info.title);
    put('E13', info.klass);
    if (Object.keys(head.Anasayfa).length) bytes = projePatch(bytes, head);
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var wb = XLSX.read(bytes, { type: 'array', cellFormula: true });
    var files = fflate.unzipSync(bytes);
    var decoder = new TextDecoder();
    var encoder = new TextEncoder();
    var wbXml = decoder.decode(files['xl/workbook.xml']);
    var rels = decoder.decode(files['xl/_rels/workbook.xml.rels']);
    var sheets = [];
    wbXml.replace(/<sheet\b[^>]*>/g, function(tag) {
        var name = (tag.match(/name="([^"]+)"/) || [])[1];
        var id = (tag.match(/r:id="([^"]+)"/) || [])[1];
        var rel = rels.match(new RegExp('Id="' + id + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + id + '"'));
        if (!name || !rel) return;
        var target = rel[1].replace(/^\//, '');
        if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\.\//, '');
        sheets.push({ name: name, path: target });
    });
    var sources = (wb.SheetNames || []).filter(function(name) {
        if (!/eokul/i.test(name) || !wb.Sheets[name]) return false;
        return !!(projeText(wb.Sheets[name], 'B5') || projeText(wb.Sheets[name], 'C5') || projeText(wb.Sheets[name], 'B7'));
    });
    if (!sources.length) sources = ['Eokul'];
    sheets.forEach(function(sheet) {
        if (!files[sheet.path]) return;
        if (/veri|ölçüt|olcut|anasayfa|eokul/i.test(sheet.name)) return;
        var xml = decoder.decode(files[sheet.path]);
        var hit = sources.some(function(name) { return xml.indexOf('>' + name + '!') >= 0; });
        if (!hit) return;
        files[sheet.path] = encoder.encode(projePaintSheet(xml, wb, sheet.name, info));
    });
    if (wbXml.indexOf('<calcPr') < 0) wbXml = wbXml.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>');
    else wbXml = wbXml.replace(/<calcPr\b[^>]*\/?>/, '<calcPr calcMode="auto" fullCalcOnLoad="1"/>');
    files['xl/workbook.xml'] = encoder.encode(wbXml);
    return fflate.zipSync(files);
}
function downloadProjeSheet() {
    if (!window._projeRaw || !window.fflate || !window.XLSX) return;
    var saved = (officeBag().projeSaved || []).filter(function(item) { return item.id === window._projeSavedId; })[0] || window._projeMeta || {};
    var info = projeInfoNow(saved);
    projeSyncSource(saved);
    var edits = window._projeEdits || {};
    var has = Object.keys(edits).some(function(name) { return Object.keys(edits[name] || {}).length; });
    var bytes;
    try { bytes = has ? projePatch(window._projeRaw, edits) : window._projeRaw; }
    catch (err) { return alert('İndirilemedi. Sayfayı yenileyip tekrar dene.'); }
    try { bytes = projeBakeBytes(bytes, info); }
    catch (err2) { return alert('İndirilemedi. Sayfayı yenileyip tekrar dene.'); }
    projeDownload(bytes, ((saved && saved.label) || 'olcek') + '.xlsx');
}
function replaceProjeSaved(id, input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (file.size > 12000000) return alert('Dosya 12 MB üstü.');
    var reader = new FileReader();
    reader.onload = function() {
        officeFilePut('proje-doc-' + id, reader.result).then(function() {
            var bag = officeBag();
            (bag.projeSaved || []).forEach(function(item) {
                if (item.id === id) item.when = new Date().toLocaleString('tr-TR');
            });
            officeWrite(bag);
            openProjeSaved();
        });
    };
    reader.readAsArrayBuffer(file);
}
function openProjeSaved() {
    var rows = (officeBag().projeSaved || []).map(function(item) {
        return { item: { source: 'proje', id: item.id, name: item.label, when: item.when }, extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteProjeSaved(\'' + item.id + '\')">Sil</button>' };
    });
    officeShell('Kayıtlı ölçekler', officeDocTable(rows, true), '', 'proje-saved');
}
function deleteProjeSaved(id) {
    if (!confirm('Ölçek silinsin mi?')) return;
    var bag = officeBag();
    bag.projeSaved = (bag.projeSaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('proje-doc-' + id).then(function() {
        window._skipHistory = true;
        openProjeSaved();
        window._skipHistory = false;
    });
}
function openGunlukHome() {
    officeShell('Günlük plan', officeCards([
        { title: 'Ekle', text: 'Sınıf, ünite, program', click: "openEvrakScreen('gunluk-up')" },
        { title: 'Oluştur', text: 'Haftanın planı', click: "openEvrakScreen('gunluk-build')" },
        { title: 'Kayıtlı', text: 'Sınıfa göre liste', click: "openEvrakScreen('gunluk-saved')" }
    ]), '', 'gunluk');
}
function officeOrderNo(text) {
    var match = String(text || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 999;
}
function sortCurricula(list) {
    return (list || []).slice().sort(function(a, b) {
        var grade = parseInt(a.grade, 10) - parseInt(b.grade, 10);
        if (grade) return grade;
        var unit = officeOrderNo(a.unit) - officeOrderNo(b.unit);
        if (unit) return unit;
        return String(a.unit || '').localeCompare(String(b.unit || ''), 'tr');
    });
}
function sortDaily(list) {
    return (list || []).slice().sort(function(a, b) {
        var grade = parseInt(a.grade, 10) - parseInt(b.grade, 10);
        if (grade) return grade;
        return parseInt(a.week, 10) - parseInt(b.week, 10);
    });
}
function openGunlukUpload() {
    var rows = sortCurricula(officeBag().curricula).map(function(item) {
        return { item: { source: 'none', id: item.id, name: item.grade + '. sınıf ' + item.unit, when: item.when }, extra: '<button class="auth-btn doc-mini" onclick="downloadCurriculum(\'' + item.id + '\')">İndir</button><button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteCurriculum(\'' + item.id + '\')">Sil</button>' };
    });
    officeShell('Öğretim programı ekle',
        '<select id="curr-grade" class="auth-input" onchange="fillCurriculumUnits()"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="curr-unit" class="auth-input"></select>' +
        '<input id="curr-file" type="file" accept=".pdf,application/pdf" class="auth-input">' +
        '<button class="auth-btn" onclick="saveCurriculum()">Kaydet</button>' + officeDocTable(rows),
        '', 'gunluk-up');
    fillCurriculumUnits();
}
function fillCurriculumUnits() {
    var gradeEl = document.getElementById('curr-grade');
    var sel = document.getElementById('curr-unit');
    if (!gradeEl || !sel) return;
    var units = (typeof fenData !== 'undefined' && fenData[gradeEl.value] && fenData[gradeEl.value].units) || [];
    sel.innerHTML = units.map(function(unit) { return '<option value="' + officeEsc(unit.name) + '">' + officeEsc(unit.name) + '</option>'; }).join('') || '<option value="Ünite">Ünite</option>';
}
function saveCurriculum() {
    var input = document.getElementById('curr-file');
    var file = input && input.files && input.files[0];
    if (!file) return alert('Öğretim programı PDF seç.');
    var grade = document.getElementById('curr-grade').value;
    var unit = document.getElementById('curr-unit').value;
    var reader = new FileReader();
    reader.onload = function() {
        var id = 'c' + Date.now().toString(36);
        officeFilePut('curr-' + id, reader.result).then(function() {
            var bag = officeBag();
            bag.curricula = bag.curricula || [];
            bag.curricula.unshift({ id: id, grade: grade, unit: unit, name: file.name, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            openGunlukUpload();
        });
    };
    reader.readAsArrayBuffer(file);
}
function downloadCurriculum(id) {
    var item = (officeBag().curricula || []).filter(function(row) { return row.id === id; })[0];
    officeFileGet('curr-' + id).then(function(buffer) {
        if (!buffer) return alert('Dosya bulunamadı.');
        saveBlob(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), (item && item.name) || 'program.pdf', 'application/pdf');
    });
}
function deleteCurriculum(id) {
    if (!confirm('Program silinsin mi?')) return;
    var bag = officeBag();
    bag.curricula = (bag.curricula || []).filter(function(row) { return row.id !== id; });
    officeWrite(bag);
    officeFileDel('curr-' + id).then(function() {
        window._skipHistory = true;
        openGunlukUpload();
        window._skipHistory = false;
    });
}
function openGunlukBuild() {
    officeShell('Günlük plan oluştur',
        '<p style="color:#fff;">Yıllık plandaki haftayı seç. Öğretim programındaki kazanım, içerik ve uygulamalar ilgili yerlere gelir. Okul, öğretmen, müdür ve tarih sistemden yazılır.</p>' +
        '<select id="daily-grade" class="auth-input" onchange="fillDailyWeeks()"><option>5</option><option>6</option><option>7</option><option>8</option></select>' +
        '<select id="daily-week" class="auth-input" onchange="showDailyWeek()"></select>' +
        '<div id="daily-preview" style="color:#fff;margin:8px 0;"></div>' +
        '<button class="auth-btn" onclick="buildDailyPlan()">Oluştur ve kaydet</button>',
        '', 'gunluk-build');
    fillDailyWeeks();
}
function fillDailyWeeks() {
    var gradeEl = document.getElementById('daily-grade');
    var sel = document.getElementById('daily-week');
    if (!gradeEl || !sel) return;
    var weeks = officeWeeks(gradeEl.value).filter(function(item) { return item.no && !item.holiday; });
    var nos = [];
    weeks.forEach(function(item) { if (nos.indexOf(String(item.no)) < 0) nos.push(String(item.no)); });
    sel.innerHTML = nos.map(function(no) {
        var row = weeks.filter(function(item) { return String(item.no) === no; })[0] || {};
        return '<option value="' + no + '">' + no + '. hafta ' + officeEsc(gainDateLabel(row)) + '</option>';
    }).join('') || '<option value="">Yıllık plan yok</option>';
    showDailyWeek();
}
function showDailyWeek() {
    var box = document.getElementById('daily-preview');
    var gradeEl = document.getElementById('daily-grade');
    var sel = document.getElementById('daily-week');
    if (!box || !gradeEl || !sel) return;
    var rows = officeWeeks(gradeEl.value).filter(function(item) { return String(item.no) === sel.value; });
    box.innerHTML = rows.map(function(item) {
        return '<p>' + officeEsc(item.unite || '') + '<br>' + officeEsc(item.konu || '') + '<br>' + officeEsc(item.kazanim || '') + '</p>';
    }).join('') || '<p>Bu sınıfın yıllık planı yok.</p>';
}
function dailyPrograms(grade, unite) {
    var list = (officeBag().curricula || []).filter(function(item) { return String(item.grade) === String(grade); });
    var words = String(unite || '').toLocaleLowerCase('tr-TR').split(/[^a-zçğıöşü0-9]+/).filter(function(word) { return word.length > 3; });
    list.forEach(function(item) {
        var name = String(item.unit || '').toLocaleLowerCase('tr-TR');
        item._score = 0;
        words.forEach(function(word) { if (name.indexOf(word) >= 0) item._score += word.length; });
    });
    list.sort(function(a, b) { return (b._score || 0) - (a._score || 0); });
    var hit = list.filter(function(item) { return item._score > 0; });
    return hit.length ? hit : list;
}
function dailyPageText(content) {
    var rows = [];
    (content.items || []).forEach(function(item) {
        if (!item.str || !String(item.str).trim()) return;
        var y = item.transform ? item.transform[5] : 0;
        var row = null;
        for (var i = 0; i < rows.length; i++) {
            if (Math.abs(rows[i].y - y) <= 2) { row = rows[i]; break; }
        }
        if (!row) { row = { y: y, parts: [] }; rows.push(row); }
        row.parts.push({ x: item.transform ? item.transform[4] : 0, str: item.str, w: item.width || 0 });
    });
    rows.sort(function(a, b) { return b.y - a.y; });
    return rows.map(function(row) {
        row.parts.sort(function(a, b) { return a.x - b.x; });
        var text = '';
        var end = null;
        row.parts.forEach(function(part) {
            if (end != null && part.x - end > 1.4) text += ' ';
            text += part.str;
            end = part.x + (part.w || 0);
        });
        return text.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean).join('\n');
}
function dailyTidy(text) {
    var out = String(text || '');
    var pass;
    for (pass = 0; pass < 8; pass++) out = out.replace(/([A-Za-zÇĞİÖŞÜçğıöşü])\s+([çğıöşüÇĞİÖŞÜ])\s+(?=[A-Za-zÇĞİÖŞÜçğıöşü])/g, '$1$2');
    return out
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/g, ' ')
        .replace(/Güncelleme tarihi:[^\n]*/gi, ' ')
        .replace(/Türkiye Yüzyılı Maarif Modeli/gi, ' ')
        .replace(/Fen Bilimleri Dersi[^\n]{0,140}/gi, ' ')
        .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n')
        .trim();
}
function dailyPdfText(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return ensurePdfJsLoaded().then(function(pdfjs) {
        if (!pdfjs) throw new Error('PDF okunamadı');
        return pdfjs.getDocument({ data: bytes.slice(0) }).promise.then(function(doc) {
            var jobs = [];
            for (var page = 1; page <= doc.numPages; page++) jobs.push(doc.getPage(page));
            return Promise.all(jobs).then(function(pages) {
                return Promise.all(pages.map(function(page) { return page.getTextContent(); }));
            }).then(function(contents) {
                return dailyTidy(contents.map(dailyPageText).join('\n'));
            });
        });
    });
}
function dailySections(text) {
    var names = ['öğrenme çıktıları ve süreç bileşenleri', 'öğrenme-öğretme uygulamaları', 'öğrenme-öğretme yaşantıları', 'ön değerlendirme süreci', 'programlar arası bileşenler', 'sosyal-duygusal öğrenme', 'disiplinler arası ilişkiler', 'beceriler arası ilişkiler', 'okuryazarlık becerileri', 'kavramsal beceriler', 'anahtar kavramlar', 'öğrenme kanıtları', 'içerik çerçevesi', 'temel kabuller', 'alan becerileri', 'köprü kurma', 'zenginleştirme', 'farklılaştırma', 'destekleme', 'eğilimler', 'değerler'];
    var lower = text.toLocaleLowerCase('tr-TR');
    var found = [];
    names.forEach(function(name) {
        var at = lower.indexOf(name);
        if (at < 0) return;
        if (found.some(function(item) { return Math.abs(item.at - at) < 4; })) return;
        found.push({ name: name, at: at });
    });
    found.sort(function(a, b) { return a.at - b.at; });
    var sections = {};
    found.forEach(function(item, index) {
        var end = found[index + 1] ? found[index + 1].at : text.length;
        sections[item.name] = text.slice(item.at + item.name.length, end).replace(/\s+/g, ' ').trim();
    });
    return sections;
}
function dailyStop(text) {
    var lower = String(text || '').toLocaleLowerCase('tr-TR');
    var cut = text.length;
    ['bu ünitede', 'ders saati', 'güncelleme tarihi'].forEach(function(stop) {
        var at = lower.indexOf(stop);
        if (at > 30 && at < cut) cut = at;
    });
    return String(text || '').slice(0, cut).replace(/\s+/g, ' ').trim();
}
function dailyUseCode(section, code) {
    var current = code;
    while (current && current.split('.').length >= 3) {
        var re = new RegExp(current.replace(/\./g, '\\.') + '(?!\\d)');
        if (re.test(section)) return current;
        if (current.split('.').length <= 4) break;
        current = current.replace(/\.\d+$/, '');
    }
    return code;
}
function dailyBlock(section, code) {
    if (!section) return '';
    var use = dailyUseCode(section, code);
    var at = section.search(new RegExp(use.replace(/\./g, '\\.') + '(?!\\d)'));
    if (at < 0) return '';
    var rest = section.slice(at);
    var tail = rest.slice(use.length);
    var next = tail.search(/\b[A-ZÇĞİÖŞÜ]{2,6}\.\d+\.\d+\.\d+(?!\.\d)/);
    return dailyStop(next > 0 ? rest.slice(0, use.length + next) : rest);
}
function dailySplitOutcome(block) {
    var match = String(block || '').match(/(?:^|\s)([a-dç])\)\s*/i);
    if (!match) return { title: String(block || '').replace(/\s+/g, ' ').trim(), steps: '' };
    var at = match.index + (match[0].charAt(0) === ' ' || match[0].charAt(0) === '\n' ? 1 : 0);
    var title = block.slice(0, match.index).replace(/\s+/g, ' ').replace(/\s+süreç bileşenleri\s+/gi, ' ').trim();
    var steps = block.slice(at).replace(/\s+([a-dç])\)\s*/gi, '\n$1) ').replace(/^\s+/, '').trim();
    return { title: title, steps: steps };
}
function dailyPullOutcomes(text, codes) {
    var titles = [];
    var steps = [];
    var seen = {};
    (codes || []).forEach(function(code) {
        var use = dailyUseCode(text, code);
        if (!use || seen[use]) return;
        seen[use] = true;
        var at = text.search(new RegExp(use.replace(/\./g, '\\.') + '(?!\\d)'));
        if (at < 0) return;
        var rest = text.slice(at);
        var tail = rest.slice(use.length);
        var next = tail.search(/\b[A-ZÇĞİÖŞÜ]{2,6}\.\d+\.\d+\.\d+(?!\.\d)/);
        var block = next > 0 ? rest.slice(0, use.length + next) : rest.slice(0, 2200);
        var lower = block.toLocaleLowerCase('tr-TR');
        ['içerik çerçevesi', 'anahtar kavramlar', 'öğrenme kanıtları', 'öğrenme-öğretme', 'temel kabuller'].forEach(function(head) {
            var pos = lower.indexOf(head);
            if (pos > 20) {
                block = block.slice(0, pos);
                lower = block.toLocaleLowerCase('tr-TR');
            }
        });
        block = block.replace(/süreç bileşenleri/gi, ' ');
        var parts = dailySplitOutcome(block);
        if (parts.title) titles.push(parts.title);
        if (parts.steps) steps.push(parts.steps);
    });
    return { cikti: titles.join('\n'), surec: steps.join('\n\n') };
}
function dailyFields(full, codes, konu) {
    var tidy = dailyTidy(full);
    var sections = dailySections(tidy);
    var outcomes = dailyPullOutcomes(tidy, codes);
    var practiceText = sections['öğrenme-öğretme uygulamaları'] || '';
    var practices = [];
    (codes || []).forEach(function(code) {
        var practice = dailyBlock(practiceText, code);
        if (practice && practices.indexOf(practice) < 0) practices.push(practice);
    });
    var icerik = String(konu || '').trim();
    if (!icerik) icerik = dailyStop(sections['içerik çerçevesi'] || '');
    return {
        cikti: outcomes.cikti,
        surec: outcomes.surec,
        icerik: icerik,
        uygulama: practices.join('\n\n'),
        kabul: dailyStop(sections['temel kabuller'] || ''),
        on: dailyStop(sections['ön değerlendirme süreci'] || ''),
        kopru: dailyStop(sections['köprü kurma'] || ''),
        zengin: dailyStop(sections['zenginleştirme'] || ''),
        destek: dailyStop(sections['destekleme'] || ''),
        kavram: dailyStop(sections['anahtar kavramlar'] || ''),
        kanit: dailyStop(sections['öğrenme kanıtları'] || ''),
        alan: dailyStop(sections['alan becerileri'] || ''),
        kavramsal: dailyStop(sections['kavramsal beceriler'] || ''),
        egilim: dailyStop(sections['eğilimler'] || '')
    };
}
function dailyWord(info, fields) {
    function row(label, value, boldValue) {
        return '<w:tr>' + docxCell(docxP(label, { bold: true, size: 21 }), { w: 3400, fill: 'FFEDD5' }) + docxCell(docxP(value || ' ', { bold: !!boldValue, size: 21 }), { w: 7400 }) + '</w:tr>';
    }
    function table(rows) { return '<w:tbl><w:tblPr><w:tblW w:w="10800" w:type="dxa"/></w:tblPr>' + rows + '</w:tbl>'; }
    var body = docxP(info.head, { align: 'center', bold: true, size: 28 }) + docxP(info.week + '. HAFTA', { align: 'center', bold: true, size: 32 }) +
        docxP(info.date, { align: 'center', size: 21 }) +
        table(row('DERSİN ADI', info.lesson) + row('SINIF', info.grade) + row('ÜNİTE / TEMA', info.unite) + row('İÇERİK ÇERÇEVESİ', fields.icerik || info.konu) + row('ÖNERİLEN SÜRE', info.saat)) +
        docxP('2. BÖLÜM', { bold: true }) +
        table(row('ALAN BECERİLERİ', fields.alan) + row('KAVRAMSAL BECERİLER', fields.kavramsal) + row('EĞİLİMLER', fields.egilim)) +
        docxP('3. BÖLÜM', { bold: true }) +
        table(row('ÖĞRENME ÇIKTILARI', fields.cikti || info.kazanim, true) + row('SÜREÇ BECERİLERİ', fields.surec) + row('ANAHTAR KAVRAMLAR', fields.kavram) + row('TEMEL KABULLER', fields.kabul) + row('ÖN DEĞERLENDİRME', fields.on) + row('KÖPRÜ KURMA', fields.kopru) + row('ÖĞRENME-ÖĞRETME UYGULAMALARI', fields.uygulama)) +
        docxP('4. BÖLÜM', { bold: true }) + table(row('ZENGİNLEŞTİRME', fields.zengin) + row('DESTEKLEME', fields.destek)) +
        docxP('5. BÖLÜM', { bold: true }) + table(row('ÖĞRENME KANITLARI', fields.kanit)) +
        docxP(' ') + table('<w:tr>' + docxCell(docxP(info.teacher + '\nDers Öğretmeni', { align: 'center', bold: true, size: 21 }), { w: 5400 }) + docxCell(docxP((info.principal || ' ') + '\nOkul Müdürü', { align: 'center', bold: true, size: 21 }), { w: 5400 }) + '</w:tr>');
    return docxPack(body);
}
function buildDailyPlan() {
    var grade = document.getElementById('daily-grade').value;
    var week = document.getElementById('daily-week').value;
    if (!week) return alert('Yıllık plan yok. Önce çerçeveyi yükleyip plan oluştur.');
    var rows = officeWeeks(grade).filter(function(item) { return String(item.no) === String(week); });
    var programs = dailyPrograms(grade, rows.map(function(item) { return item.unite; }).join(' '));
    if (!programs.length) return alert('Bu sınıf için öğretim programı yok. Ekle kartından ünite PDF yükle.');
    var codes = [];
    rows.forEach(function(item) {
        String(item.kazanim || '').replace(/[A-ZÇĞİÖŞÜ]{1,6}\.\d+(?:\.\d+){1,4}/g, function(code) {
            if (codes.indexOf(code) < 0) codes.push(code);
            return code;
        });
    });
    var reads = programs.map(function(item) {
        return officeFileGet('curr-' + item.id).then(function(buffer) {
            if (!buffer) return '';
            return dailyPdfText(buffer);
        });
    });
    Promise.all(reads).then(function(texts) {
        var best = '';
        var bestScore = -1;
        texts.forEach(function(text) {
            var score = 0;
            codes.forEach(function(code) {
                if (text.indexOf(code) >= 0) score += 3;
                else if (text.indexOf(code.replace(/\.\d+$/, '')) >= 0) score += 1;
            });
            if (!codes.length) score = 1;
            if (score > bestScore) { bestScore = score; best = text; }
        });
        var konu = rows.map(function(item) { return item.konu; }).filter(Boolean).join(' / ');
        var fields = dailyFields(best || texts.join('\n'), codes, konu);
        var lesson = (typeof canonicalSubject === 'function' && currentTeacher) ? canonicalSubject(currentTeacher.subject) : ((currentTeacher && currentTeacher.subject) || 'DERS');
        var year = typeof currentPortalYear === 'function' ? currentPortalYear() : '';
        var school = (currentTeacher && currentTeacher.school_name) || '';
        var info = {
            head: year + ' EĞİTİM-ÖĞRETİM YILI ' + school + ' ' + grade + '. SINIF ' + lesson + ' DERSİ GÜNLÜK PLANI',
            week: week,
            date: (rows[0] && gainDateLabel(rows[0])) || new Date().toLocaleDateString('tr-TR'),
            lesson: lesson,
            grade: grade,
            unite: rows.map(function(item) { return item.unite; }).filter(Boolean).join(' / '),
            konu: rows.map(function(item) { return item.konu; }).filter(Boolean).join(' / '),
            saat: (rows[0] && rows[0].saat) || '',
            kazanim: rows.map(function(item) { return item.kazanim; }).filter(Boolean).join('\n'),
            teacher: (currentTeacher && currentTeacher.full_name) || '',
            principal: officeStaff().principal
        };
        var id = 'd' + Date.now().toString(36);
        var label = grade + '. sınıf ' + week + '. hafta günlük plan';
        officeFilePut('daily-doc-' + id, dailyWord(info, fields)).then(function() {
            var bag = officeBag();
            bag.dailySaved = bag.dailySaved || [];
            bag.dailySaved.unshift({ id: id, grade: grade, week: week, label: label, when: new Date().toLocaleString('tr-TR') });
            officeWrite(bag);
            alert('Günlük plan kaydedildi.');
            openGunlukSaved();
        });
    }).catch(function() { alert('Öğretim programı okunamadı.'); });
}
function openGunlukSaved() {
    officeShell('Kayıtlı günlük planlar',
        '<select id="daily-saved-grade" class="auth-input" onchange="paintDailySaved()"><option value="">Tüm sınıflar</option><option>5</option><option>6</option><option>7</option><option>8</option></select><div id="daily-saved-list"></div>',
        '', 'gunluk-saved');
    paintDailySaved();
}
function paintDailySaved() {
    var sel = document.getElementById('daily-saved-grade');
    var box = document.getElementById('daily-saved-list');
    if (!box) return;
    var grade = sel ? sel.value : '';
    var rows = sortDaily(officeBag().dailySaved).filter(function(item) { return !grade || String(item.grade) === grade; }).map(function(item) {
        return { item: { source: 'daily', id: item.id, name: item.label, when: item.when }, extra: '<button class="auth-btn doc-mini" style="background:#b91c1c;" onclick="deleteDailySaved(\'' + item.id + '\')">Sil</button>' };
    });
    box.innerHTML = officeDocTable(rows, true);
}
function deleteDailySaved(id) {
    if (!confirm('Plan silinsin mi?')) return;
    var bag = officeBag();
    bag.dailySaved = (bag.dailySaved || []).filter(function(item) { return item.id !== id; });
    officeWrite(bag);
    officeFileDel('daily-doc-' + id).then(function() {
        window._skipHistory = true;
        openGunlukSaved();
        window._skipHistory = false;
    });
}
function gainMonthNo(word) {
    var text = String(word || '').toLocaleLowerCase('tr-TR');
    var months = [['eylül', 9], ['ekim', 10], ['kasım', 11], ['aralık', 12], ['ocak', 1], ['şubat', 2], ['mart', 3], ['nisan', 4], ['mayıs', 5], ['haziran', 6]];
    var hit = months.filter(function(pair) { return text.indexOf(pair[0]) === 0; })[0];
    return hit ? hit[1] : 0;
}
function gainSpan(item, startYear) {
    var text = String(item.label || '').toLocaleLowerCase('tr-TR');
    function yearOf(month) { return month >= 9 ? startYear : startYear + 1; }
    function day(value, month) { return new Date(yearOf(month), month - 1, value, 12, 0, 0); }
    var cross = text.match(/(\d{1,2})\s*([a-zçğıöşü]+)\s*[-–]\s*(\d{1,2})\s*([a-zçğıöşü]+)/);
    if (cross) {
        var first = gainMonthNo(cross[2]);
        var second = gainMonthNo(cross[4]);
        if (first && second) return { start: day(+cross[1], first), end: day(+cross[3], second) };
    }
    var same = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*([a-zçğıöşü]+)/);
    if (same) {
        var month = gainMonthNo(same[3]);
        if (month) return { start: day(+same[1], month), end: day(+same[2], month) };
    }
    return null;
}
function gainDateLabel(item) {
    var text = String(item.label || '');
    var cut = text.indexOf(':') >= 0 ? text.split(':').slice(1).join(':').trim() : '';
    return cut || text;
}
function gainCurrentNo(weeks) {
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var startYear = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    var current = '';
    var last = '';
    weeks.forEach(function(item) {
        if (!item.no || item.holiday) return;
        var span = gainSpan(item, startYear);
        if (!span) return;
        if (now >= span.start && now <= span.end) current = String(item.no);
        else if (span.start <= now) last = String(item.no);
    });
    return current || last;
}
function openWeekGains(grade, forcedNo, push) {
    var weeks = officeWeeks(grade).filter(function(item) { return item.no && !item.holiday; });
    var nos = [];
    weeks.forEach(function(item) { if (nos.indexOf(String(item.no)) < 0) nos.push(String(item.no)); });
    var shown = String(forcedNo || gainCurrentNo(weeks) || (nos[0] || '1'));
    var index = Math.max(0, nos.indexOf(shown));
    if (nos.length && nos.indexOf(shown) < 0) { shown = nos[0]; index = 0; }
    var rows = weeks.filter(function(item) { return String(item.no) === shown; });
    var dateText = rows.length ? gainDateLabel(rows[0]) : '';
    var blocks = rows.map(function(item) {
        return '<div class="grade-card" style="cursor:default;margin-bottom:10px;">' +
            '<p style="color:#9a3412;font-size:12px;margin:0;">Hafta</p><h3 style="margin:2px 0 10px;">' + officeEsc(shown) + '. Hafta</h3>' +
            (dateText ? '<p style="margin:0 0 10px;">' + officeEsc(dateText) + '</p>' : '') +
            (item.unite ? '<p style="color:#9a3412;font-size:12px;margin:8px 0 0;">Ünite</p><p style="margin:2px 0 0;">' + officeEsc(item.unite) + '</p>' : '') +
            (item.konu ? '<p style="color:#9a3412;font-size:12px;margin:8px 0 0;">Konu</p><p style="margin:2px 0 0;">' + officeEsc(item.konu) + '</p>' : '') +
            (item.kazanim ? '<p style="color:#9a3412;font-size:12px;margin:8px 0 0;">Kazanım</p><p style="margin:2px 0 0;white-space:pre-wrap;">' + officeEsc(item.kazanim) + '</p>' : '') +
        '</div>';
    }).join('');
    if (!blocks) blocks = '<p style="color:#fff;">Bu hafta için yıllık plan satırı yok. Evrak, Yıllık Plan, Çerçeve yükle.</p>';
    var prev = index > 0 ? '<button class="auth-btn doc-mini" onclick="openWeekGains(\'' + grade + '\',\'' + nos[index - 1] + '\', false)">Önceki hafta</button>' : '';
    var next = nos.length && index < nos.length - 1 ? '<button class="auth-btn doc-mini" onclick="openWeekGains(\'' + grade + '\',\'' + nos[index + 1] + '\', false)">Sonraki hafta</button>' : '';
    var nav = '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;">' + prev +
        '<div style="color:#fff;text-align:center;flex:1;"><b>' + officeEsc(shown) + '. Hafta</b><br>' + officeEsc(dateText) + '</div>' + next + '</div>';
    if (push === false) window._skipHistory = true;
    officeShell(grade + '. sınıf kazanımları', nav + blocks, '', 'kazanim:' + grade + ':' + shown);
    if (push === false) window._skipHistory = false;
}
function openDailyPlan(grade) {
    var weeks = officeWeeks(grade);
    var opts = weeks.map(function(w) { return '<option value="' + officeEsc(w.no) + '">' + officeEsc(w.no) + '. hafta</option>'; }).join('') || '<option value="1">Plan yok</option>';
    officeShell('Günlük plan',
        '<select id="daily-week" class="auth-input" onchange="fillDaily()">' + opts + '</select>' +
        '<textarea id="daily-out" class="auth-input" style="height:180px;"></textarea>' +
        '<textarea id="daily-app" class="auth-input" style="height:80px;" placeholder="Öğrenme-öğretme uygulamaları"></textarea>' +
        '<button class="auth-btn" onclick="downloadDaily(\'' + grade + '\')">Word indir</button>',
        "openGradeManagement('" + grade + "', false)");
    fillDaily();
}
function fillDaily() {
    var sel = document.getElementById('daily-week');
    var grade = '5';
    ['5', '6', '7', '8'].some(function(g) {
        if (officeWeeks(g).some(function(w) { return String(w.no) === sel.value; })) { grade = g; return true; }
        return false;
    });
    var hit = officeWeeks(grade).filter(function(w) { return String(w.no) === sel.value; });
    var box = document.getElementById('daily-out');
    if (box) box.value = hit.map(function(w) { return w.text; }).join('\n');
}
function downloadDaily(grade) {
    var week = document.getElementById('daily-week').value;
    officeDoc(grade + '. sınıf ' + week + '. hafta günlük plan',
        '<p><b>Öğrenme çıktıları</b></p><p style="white-space:pre-wrap;">' + officeEsc(document.getElementById('daily-out').value) + '</p>' +
        '<p><b>Öğrenme-öğretme uygulamaları</b></p><p style="white-space:pre-wrap;">' + officeEsc(document.getElementById('daily-app').value) + '</p>' +
        '<p><b>Ölçme</b></p><p>İlgili bölüm ölçekleri ve quiz sonuçları kullanılır.</p>');
}
