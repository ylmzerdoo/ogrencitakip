const SUPABASE_URL = 'https://vaocsboltekfjknovpih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kctB4Az-JC9la65xOcLHmg_1n9XAufj';

let supabaseClient = null;
if (SUPABASE_URL) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let fenData = {
    '5': { units: [], activities: [], branches: {} },
    '6': { units: [], activities: [], branches: {} },
    '7': { units: [], activities: [], branches: {} },
    '8': { units: [], activities: [], branches: {} }
};

async function loadAllDataFromSupabase() {
    if (!supabaseClient) return;
    try {
        ['5', '6', '7', '8'].forEach(g => {
            fenData[g].units = [];
            fenData[g].activities = [];
            fenData[g].branches = {};
        });

        const { data: branchRows, error: bErr } = await supabaseClient.from('branches').select('*');
        if (!bErr && branchRows) {
            branchRows.forEach(row => {
                const g = row.grade;
                const bFullName = row.branch_name;
                if (!g || !bFullName) return;
                if (!fenData[g]) fenData[g] = { units: [], activities: [], branches: {} };
                if (!fenData[g].branches[bFullName]) {
                    fenData[g].branches[bFullName] = [];
                }
            });
        }

        const { data: studentRows, error: sErr } = await supabaseClient.from('students').select('*');
        if (!sErr && studentRows) {
            studentRows.forEach(row => {
                const g = row.grade;
                const b = row.branch;
                if (!g || !b) return;
                if (!fenData[g]) fenData[g] = { units: [], activities: [], branches: {} };
                if (!fenData[g].branches[b]) fenData[g].branches[b] = [];

                fenData[g].branches[b].push({
                    no: row.school_no,
                    name: row.name,
                    plus: row.plus || 0,
                    minus: row.minus || 0,
                    quiz: row.quiz || {},
                    scale: row.scale || {}
                });
            });

            Object.keys(fenData).forEach(g => {
                Object.keys(fenData[g].branches).forEach(b => {
                    fenData[g].branches[b].sort((a, b) => parseInt(a.no) - parseInt(b.no));
                });
            });
        }

        const { data: unitRows, error: uErr } = await supabaseClient.from('units_sections').select('*');
        if (!uErr && unitRows) {
            let unitMap = {};
            unitRows.forEach(row => {
                const g = row.grade;
                const uName = row.unit_name;
                const sName = row.section_name;

                if (!g || !uName) return;
                if (!unitMap[g]) unitMap[g] = {};
                if (!unitMap[g][uName]) unitMap[g][uName] = [];
                if (sName && sName !== 'Genel' && !unitMap[g][uName].includes(sName)) {
                    unitMap[g][uName].push(sName);
                }
            });

            Object.keys(unitMap).forEach(g => {
                Object.keys(unitMap[g]).forEach(uName => {
                    fenData[g].units.push({
                        name: uName,
                        sections: unitMap[g][uName]
                    });
                });
            });
        }

        const { data: actRows, error: aErr } = await supabaseClient.from('activities').select('*');
        if (!aErr && actRows) {
            actRows.forEach(row => {
                const g = row.grade;
                if (!g) return;
                if (!fenData[g].activities) fenData[g].activities = [];
                fenData[g].activities.push({
                    name: row.activity_name ? row.activity_name.trim() : '',
                    unit: row.unit_name ? row.unit_name.trim() : '',
                    section: row.section_name ? row.section_name.trim() : '',
                    criteria: row.criteria || [],
                    scale_type: row.scale_type || '1-4'
                });
            });
        }
    } catch (err) {
        console.error('Supabase load error:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadAllDataFromSupabase();

    const gradeSelect = document.getElementById('student-grade');
    if (gradeSelect) {
        gradeSelect.addEventListener('change', function() {
            const grade = this.value;
            const branchSelect = document.getElementById('student-branch');
            if (!branchSelect) return;
            branchSelect.innerHTML = '<option value="">Şube Seçin</option>';
            
            if (fenData[grade] && fenData[grade].branches) {
                Object.keys(fenData[grade].branches).forEach(bName => {
                    const shortBranch = bName.split('/')[1] || bName;
                    branchSelect.innerHTML += `<option value="${bName}">${shortBranch} Şubesi</option>`;
                });
            }
        });
    }

    restoreStateFromSession();
});

function toggleTeacherActionsCard() {
    const container = document.getElementById('teacher-actions-container');
    const icon = document.getElementById('teacher-actions-toggle-icon');
    if (!container || !icon) return;
    if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    } else {
        container.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

function restoreStateFromSession() {
    const savedState = sessionStorage.getItem('fen_app_state');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.type === 'teacher') {
                renderTeacherPanelView(false);
            } else if (state.type === 'grade-mgmt') {
                renderGradeManagementView(state.grade, false);
            } else if (state.type === 'branch-menu') {
                renderBranchMenuView(state.grade, state.branchName, false);
            } else if (state.type === 'branch-detail') {
                renderBranchDetailView(state.grade, state.branchName, state.tab, false);
            } else if (state.type === 'student') {
                renderStudentPanelView(state.grade, state.branch, state.student, false);
            } else {
                renderAuthScreenView();
            }
        } catch (e) {
            renderAuthScreenView();
        }
    } else {
        renderAuthScreenView();
    }
}

window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (!state || state.type === 'auth') {
        renderAuthScreenView();
    } else if (state.type === 'teacher') {
        renderTeacherPanelView(false);
    } else if (state.type === 'grade-mgmt') {
        renderGradeManagementView(state.grade, false);
    } else if (state.type === 'branch-menu') {
        renderBranchMenuView(state.grade, state.branchName, false);
    } else if (state.type === 'branch-detail') {
        renderBranchDetailView(state.grade, state.branchName, state.tab, false);
    } else if (state.type === 'student') {
        renderStudentPanelView(state.grade, state.branch, state.student, false);
    } else {
        restoreStateFromSession();
    }
});

function switchAuthTab(role) {
    const studentBtn = document.getElementById('btn-student-tab');
    const teacherBtn = document.getElementById('btn-teacher-tab');
    const studentForm = document.getElementById('student-auth-form');
    const teacherForm = document.getElementById('teacher-auth-form');

    if (!studentBtn || !teacherBtn || !studentForm || !teacherForm) return;

    if (role === 'student') {
        studentBtn.classList.add('active');
        teacherBtn.classList.remove('active');
        studentForm.style.display = 'block';
        teacherForm.style.display = 'none';
    } else {
        teacherBtn.classList.add('active');
        studentBtn.classList.remove('active');
        teacherForm.style.display = 'block';
        studentForm.style.display = 'none';
    }
}

async function teacherLogin(push = true) {
    const email = document.getElementById('teacher-email').value.trim();
    const password = document.getElementById('teacher-password').value.trim();

    if (!email || !password) {
        alert('Lütfen e-posta ve şifrenizi girin.');
        return;
    }

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                alert('Giriş Başarısız: E-posta veya şifre hatalı! (' + error.message + ')');
                return;
            }
        }
        await loadAllDataFromSupabase();
        renderTeacherPanelView(push);
    } catch (err) {
        console.error(err);
        alert('Giriş sırasında bir hata oluştu.');
    }
}

function renderTeacherPanelView(push = true) {
    const state = { type: 'teacher' };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) {
        history.pushState(state, '', '#ogretmen-paneli');
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();
}

async function logout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    sessionStorage.removeItem('fen_app_state');
    await loadAllDataFromSupabase();
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView();
}

function logoutStudent() {
    sessionStorage.removeItem('fen_app_state');
    history.pushState({ type: 'auth' }, '', '#giris');
    renderAuthScreenView();
}

function renderAuthScreenView() {
    sessionStorage.setItem('fen_app_state', JSON.stringify({ type: 'auth' }));
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();
}

function openModal(title, htmlContent, onConfirm) {
    const modal = document.getElementById('app-modal');
    if (!modal) return;
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = htmlContent;
    
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (onConfirm) {
        confirmBtn.style.display = 'inline-block';
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', onConfirm);
    } else {
        confirmBtn.style.display = 'none';
    }
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('app-modal');
    if (modal) modal.style.display = 'none';
}

function addNewBranchModal(grade) {
    const content = `<label style="color:#cbd5e1; font-size:12px;">Şube Adı (Örn: A, B, F):</label><input type="text" id="modal-branch-name" class="auth-input" placeholder="A">`;
    openModal("Yeni Şube Ekle", content, async () => {
        const inputEl = document.getElementById('modal-branch-name');
        const bInput = inputEl.value.trim().toUpperCase();
        if (!bInput) return;
        const bFullName = `${grade}/${bInput}`;

        if (supabaseClient) {
            const { error } = await supabaseClient.from('branches').insert([{
                grade: grade,
                branch_name: bFullName
            }]);
            if (error) {
                alert('Şube eklenirken hata: ' + error.message);
                return;
            }
        }

        await loadAllDataFromSupabase();
        inputEl.value = '';
        closeModal();
        openGradeManagement(grade, false);
    });
}

async function deleteBranch(grade, bName) {
    if (confirm(`${bName} şubesini silmek istiyor musunuz?`)) {
        if (supabaseClient) {
            await supabaseClient.from('branches').delete().eq('grade', grade).eq('branch_name', bName);
            await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', bName);
        }
        await loadAllDataFromSupabase();
        openGradeManagement(grade, false);
    }
}

function globalAddUnit() {
    const content = `
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:12px;">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:#cbd5e1;">Ünite Adı:</label>
        <input type="text" id="modal-text" placeholder="Örn: 1. Ünite" class="auth-input">
    `;
    openModal("Yeni Ünite Ekle", content, async () => {
        const grade = document.getElementById('modal-grade').value;
        const inputEl = document.getElementById('modal-text');
        const unitName = inputEl.value.trim();
        if (!unitName) return;

        if (supabaseClient) {
            await supabaseClient.from('units_sections').insert([{ grade: grade, unit_name: unitName, section_name: 'Genel' }]);
        }
        await loadAllDataFromSupabase();
        inputEl.value = '';
        closeModal();
        alert(`"${unitName}" buluta eklendi!`);
    });
}

function globalAddSection() {
    const content = `
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:12px;" onchange="updateModalUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:#cbd5e1;">Ünite Seçin:</label>
        <select id="modal-unit-select" class="auth-input" style="margin-bottom:12px;"><option value="">Önce sınıf seçin</option></select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:#cbd5e1;">Bölüm / Konu Adı:</label>
        <input type="text" id="modal-section" placeholder="Örn: 1. Bölüm" class="auth-input">
    `;
    openModal("Yeni Bölüm Ekle", content, async () => {
        const grade = document.getElementById('modal-grade').value;
        const unitName = document.getElementById('modal-unit-select').value;
        const sectionInput = document.getElementById('modal-section');
        const section = sectionInput.value.trim();
        if (!unitName || !section) { alert('Lütfen ünite seçin ve bölüm adı yazın.'); return; }

        if (supabaseClient) {
            await supabaseClient.from('units_sections').insert([{ grade: grade, unit_name: unitName, section_name: section }]);
        }
        await loadAllDataFromSupabase();
        sectionInput.value = '';
        closeModal();
        alert(`"${section}" bölümü buluta eklendi!`);
    });
    updateModalUnits('6');
}

function updateModalUnits(grade) {
    const unitSelect = document.getElementById('modal-unit-select');
    if (!unitSelect) return;
    unitSelect.innerHTML = '<option value="">-- Ünite Seçin --</option>';
    (fenData[grade]?.units || []).forEach(u => {
        unitSelect.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
}

function globalAddReportTemplate() {
    const content = `
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Sınıf Düzeyi:</label>
        <select id="rep-modal-grade" class="auth-input" style="margin-bottom:10px;" onchange="updateRepModalUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option><option value="7" selected>7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Ünite:</label>
        <select id="rep-modal-unit" class="auth-input" style="margin-bottom:10px;" onchange="updateRepModalSections(this.value)"><option value="">Önce sınıf seçin</option></select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Bölüm:</label>
        <select id="rep-modal-section" class="auth-input" style="margin-bottom:10px;"><option value="">Önce ünite seçin</option></select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Rapor Metni:</label>
        <textarea id="rep-modal-text" class="auth-input" style="height:120px; font-size:12px; font-family:monospace;" placeholder="Rapor metni..."></textarea>
    `;

    openModal("Resmi Rapor Şablonu Ekle", content, async () => {
        const grade = document.getElementById('rep-modal-grade').value;
        const unitName = document.getElementById('rep-modal-unit').value;
        const secName = document.getElementById('rep-modal-section').value;
        const textInput = document.getElementById('rep-modal-text');
        const reportText = textInput.value.trim();

        if (!unitName || !secName || !reportText) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        if (supabaseClient) {
            const { error } = await supabaseClient.from('report_templates').insert([{
                grade: grade,
                unit_name: unitName,
                section_name: secName,
                report_text: reportText
            }]);

            if (error) {
                alert('Hata: ' + error.message);
                return;
            }
        }

        textInput.value = '';
        closeModal();
        alert('Rapor şablonu kaydedildi!');
    });

    updateRepModalUnits('7');
}

function updateRepModalUnits(grade) {
    const unitSel = document.getElementById('rep-modal-unit');
    if (!unitSel) return;
    unitSel.innerHTML = '<option value="">-- Ünite Seçin --</option>';
    (fenData[grade]?.units || []).forEach(u => {
        unitSel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
}

function updateRepModalSections(unitName) {
    const grade = document.getElementById('rep-modal-grade').value;
    const secSel = document.getElementById('rep-modal-section');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) {
        unit.sections.forEach(s => {
            secSel.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
}

function globalAddActivity() {
    const content = `
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Sınıf:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:10px;" onchange="updateModalUnitsForActivity(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Ünite:</label>
        <select id="modal-unit" class="auth-input" style="margin-bottom:10px;" onchange="updateModalSectionsForActivity(this.value)"><option value="">Önce sınıf seçin</option></select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Bölüm:</label>
        <select id="modal-section" class="auth-input" style="margin-bottom:10px;"><option value="">Önce ünite seçin</option></select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Excel Dosyası (.xlsx):</label>
        <input type="file" id="modal-excel-file" class="auth-input" accept=".xlsx, .xls, .csv" style="margin-bottom:10px;">
    `;

    openModal("Excel Ölçek Entegrasyonu", content, () => {
        const grade = document.getElementById('modal-grade').value;
        const unit = document.getElementById('modal-unit').value;
        const section = document.getElementById('modal-section').value;
        const fileInput = document.getElementById('modal-excel-file');
        const file = fileInput.files[0];

        if (!unit || !section || !file) {
            alert('Lütfen ünite, bölüm seçin ve dosya yükleyin!');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                let importedCount = 0;

                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    let currentScaleTitle = sheetName.trim();
                    let scaleType = '1-4'; 
                    let criteriaColumns = [];

                    for (let i = 0; i < jsonRows.length; i++) {
                        let row = jsonRows[i];
                        if (!row) continue;

                        for (let cell of row) {
                            if (cell && typeof cell === 'string') {
                                if (cell.includes('RUBRİK') || cell.includes('1-4')) scaleType = '1-4';
                                else if (cell.includes('KONTROL') || cell.includes('VAR')) scaleType = 'var-yok';
                                else if (cell.includes('FORMU') || cell.includes('EVET')) scaleType = 'evet-hayir';

                                if (cell.includes('RUBRİK') || cell.includes('FORMU') || cell.includes('LİSTESİ') || cell.includes('ÖLÇEĞİ')) {
                                    currentScaleTitle = `${sheetName.trim()} - ${cell.trim()}`;
                                }
                            }
                        }

                        if (row.some(cell => cell && (cell.toString().includes('Okul No') || cell.toString().includes('Adı Soyadı')))) {
                            criteriaColumns = row.filter(cell => 
                                cell && 
                                !cell.toString().includes('Okul No') && 
                                !cell.toString().includes('Adı Soyadı') && 
                                !cell.toString().includes('TOPLAM') && 
                                !cell.toString().includes('BAŞARI') &&
                                !cell.toString().includes('Açıklama')
                            );

                            if (criteriaColumns.length > 0 && supabaseClient) {
                                await supabaseClient.from('activities').insert([{
                                    grade: grade,
                                    unit_name: unit,
                                    section_name: section,
                                    activity_name: currentScaleTitle,
                                    criteria: criteriaColumns,
                                    scale_type: scaleType
                                }]);
                                importedCount++;
                                criteriaColumns = [];
                            }
                        }
                    }

                    if (importedCount === 0 && jsonRows.length > 0) {
                        await supabaseClient.from('activities').insert([{
                            grade: grade,
                            unit_name: unit,
                            section_name: section,
                            activity_name: sheetName.trim(),
                            criteria: ['1. Kriter', '2. Kriter', '3. Kriter', '4. Kriter'],
                            scale_type: '1-4'
                        }]);
                        importedCount++;
                    }
                }

                await loadAllDataFromSupabase();
                fileInput.value = '';
                closeModal();
                alert(`Toplam ${importedCount} ölçek yüklendi!`);
            } catch (err) {
                console.error(err);
                alert('Hata: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });

    updateModalUnitsForActivity('6');
}

function updateModalUnitsForActivity(grade) {
    const unitSel = document.getElementById('modal-unit');
    if (!unitSel) return;
    unitSel.innerHTML = '<option value="">-- Ünite Seçin --</option>';
    (fenData[grade]?.units || []).forEach(u => {
        unitSel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
    updateModalSectionsForActivity('');
}

function updateModalSectionsForActivity(unitName) {
    const grade = document.getElementById('modal-grade').value;
    const secSel = document.getElementById('modal-section');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) {
        unit.sections.forEach(s => {
            secSel.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
}

function globalDeleteManagement() {
    const content = `
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Sınıf:</label>
        <select id="del-grade" class="auth-input" style="margin-bottom:10px;" onchange="updateDelUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">İşlem Türü:</label>
        <select id="del-type" class="auth-input" style="margin-bottom:10px;" onchange="toggleDelFields()">
            <option value="unit">Ünite Sil</option>
            <option value="section">Bölüm Sil</option>
            <option value="activity">Etkinlik / Ölçek Sil</option>
            <option value="report">Rapor Şablonu Sil</option>
        </select>
        <div id="del-unit-container" style="margin-bottom:10px;">
            <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Ünite:</label>
            <select id="del-unit-select" class="auth-input" onchange="updateDelSections(this.value)"><option value="">-- Ünite --</option></select>
        </div>
        <div id="del-section-container" style="margin-bottom:10px; display:none;">
            <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Bölüm:</label>
            <select id="del-section-select" class="auth-input" onchange="updateDelActivitiesAndReports()"><option value="">-- Bölüm --</option></select>
        </div>
        <div id="del-activity-container" style="margin-bottom:10px; display:none;">
            <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Etkinlik:</label>
            <select id="del-activity-select" class="auth-input"><option value="">-- Etkinlik --</option></select>
        </div>
        <div id="del-report-container" style="margin-bottom:10px; display:none;">
            <label style="display:block; margin-bottom:4px; font-weight:600; font-size:12px; color:#cbd5e1;">Rapor:</label>
            <select id="del-report-select" class="auth-input"><option value="">-- Rapor --</option></select>
        </div>
    `;

    openModal("İçerik Silme Yönetimi", content, async () => {
        const grade = document.getElementById('del-grade').value;
        const type = document.getElementById('del-type').value;

        if (type === 'unit') {
            const unitName = document.getElementById('del-unit-select').value;
            if (!unitName) { alert('Ünite seçin.'); return; }
            if (confirm(`"${unitName}" ünitesi ve bağlı her şey silinsin mi?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('units_sections').delete().eq('grade', grade).eq('unit_name', unitName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('unit_name', unitName);
                    await supabaseClient.from('report_templates').delete().eq('grade', grade).eq('unit_name', unitName);
                }
                await loadAllDataFromSupabase();
                updateDelUnits(grade);
                closeModal();
                alert('Ünite silindi!');
            }
        } else if (type === 'section') {
            const unitName = document.getElementById('del-unit-select').value;
            const secName = document.getElementById('del-section-select').value;
            if (!unitName || !secName) { alert('Ünite ve bölüm seçin.'); return; }
            if (confirm(`"${secName}" bölümü silinsin mi?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('units_sections').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                    await supabaseClient.from('report_templates').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                }
                await loadAllDataFromSupabase();
                updateDelSections(unitName);
                closeModal();
                alert('Bölüm silindi!');
            }
        } else if (type === 'activity') {
            const actName = document.getElementById('del-activity-select').value;
            if (!actName) { alert('Etkinlik seçin.'); return; }
            if (confirm(`"${actName}" etkinliği silinsin mi?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('activity_name', actName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).ilike('activity_name', actName + ' -%');
                }
                await loadAllDataFromSupabase();
                updateDelActivitiesAndReports();
                closeModal();
                alert('Etkinlik silindi!');
            }
        } else if (type === 'report') {
            const unitName = document.getElementById('del-unit-select').value;
            const secName = document.getElementById('del-section-select').value;
            if (!unitName || !secName) { alert('Ünite ve bölüm seçin.'); return; }
            if (confirm('Rapor şablonu silinsin mi?')) {
                if (supabaseClient) {
                    await supabaseClient.from('report_templates').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                }
                await loadAllDataFromSupabase();
                updateDelActivitiesAndReports();
                closeModal();
                alert('Rapor silindi!');
            }
        }
    });

    updateDelUnits('6');
    toggleDelFields();
}

function updateDelUnits(grade) {
    const unitSel = document.getElementById('del-unit-select');
    if (!unitSel) return;
    unitSel.innerHTML = '<option value="">-- Ünite --</option>';
    (fenData[grade]?.units || []).forEach(u => {
        unitSel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
    updateDelSections('');
}

function updateDelSections(unitName) {
    const grade = document.getElementById('del-grade').value;
    const secSel = document.getElementById('del-section-select');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) {
        unit.sections.forEach(s => {
            secSel.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
    updateDelActivitiesAndReports();
}

function updateDelActivitiesAndReports() {
    const grade = document.getElementById('del-grade').value;
    const unitName = document.getElementById('del-unit-select')?.value;
    const secName = document.getElementById('del-section-select')?.value;
    
    const actSel = document.getElementById('del-activity-select');
    if (actSel) {
        actSel.innerHTML = '<option value="">-- Etkinlik --</option>';
        if (unitName && secName) {
            let baseActivityNames = new Set();
            (fenData[grade]?.activities || []).filter(a => a.unit === unitName && a.section === secName).forEach(a => {
                let cleanName = a.name.trim();
                let parts = cleanName.split(' - ');
                if (parts.length >= 2) {
                    baseActivityNames.add(`${parts[0]} - ${parts[1]}`);
                } else {
                    baseActivityNames.add(cleanName);
                }
            });
            baseActivityNames.forEach(bAct => {
                actSel.innerHTML += `<option value="${bAct}">${bAct}</option>`;
            });
        }
    }
}

function toggleDelFields() {
    const type = document.getElementById('del-type').value;
    const unitCont = document.getElementById('del-unit-container');
    const secCont = document.getElementById('del-section-container');
    const actCont = document.getElementById('del-activity-container');
    const repCont = document.getElementById('del-report-container');

    if (!unitCont || !secCont || !actCont || !repCont) return;

    if (type === 'unit') {
        unitCont.style.display = 'block';
        secCont.style.display = 'none';
        actCont.style.display = 'none';
        repCont.style.display = 'none';
    } else if (type === 'section') {
        unitCont.style.display = 'block';
        secCont.style.display = 'block';
        actCont.style.display = 'none';
        repCont.style.display = 'none';
    } else if (type === 'activity') {
        unitCont.style.display = 'block';
        secCont.style.display = 'block';
        actCont.style.display = 'block';
        repCont.style.display = 'none';
        updateDelActivitiesAndReports();
    } else if (type === 'report') {
        unitCont.style.display = 'block';
        secCont.style.display = 'block';
        actCont.style.display = 'none';
        repCont.style.display = 'block';
        updateDelActivitiesAndReports();
    }
}

function openGradeManagement(grade, push = true) {
    renderGradeManagementView(grade, push);
}

function renderGradeManagementView(grade, push = true) {
    const state = { type: 'grade-mgmt', grade };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) {
        history.pushState(state, '', `#sinif-${grade}`);
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    const detailPanel = document.getElementById('grade-detail-panel');
    if (!detailPanel) return;
    detailPanel.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();

    let branchCards = '';
    const branches = fenData[grade]?.branches || {};
    Object.keys(branches).forEach(bName => {
        const studentCount = branches[bName].length;
        branchCards += `
            <div class="grade-card" style="border-top-color: #3b82f6; position: relative;">
                <div onclick="openBranchMenu('${grade}', '${bName}')" style="cursor: pointer;">
                    <h3>${bName} Şubesi</h3>
                    <p>${studentCount} Öğrenci Kayıtlı</p>
                    <span class="card-action">Şubeye Git &rarr;</span>
                </div>
                <button onclick="event.stopPropagation(); deleteBranch('${grade}', '${bName}')" style="position: absolute; top: 10px; right: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size:11px;">Sil</button>
            </div>
        `;
    });

    detailPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><span class="brand-icon">📚</span><h1>${grade}. SINIFLAR</h1></div>
            <div>
                <button onclick="renderTeacherPanelView(true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri Dön</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div style="margin-bottom: 15px;">
                <button onclick="addNewBranchModal('${grade}')" class="auth-btn" style="width: auto; padding: 8px 16px; background:#059669;">+ Yeni Şube Ekle</button>
            </div>
            <h3 style="font-size:15px; margin-bottom:10px;">Şubeler</h3>
            <div class="grade-cards-grid">
                ${branchCards || '<p style="color:#94a3b8; font-size:12px;">Henüz şube eklenmemiş.</p>'}
            </div>
        </section>
    `;
}

function openBranchMenu(grade, branchName, push = true) {
    renderBranchMenuView(grade, branchName, push);
}

function renderBranchMenuView(grade, branchName, push = true) {
    const state = { type: 'branch-menu', grade, branchName };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) {
        const cleanBranch = branchName.replace('/', '-');
        history.pushState(state, '', `#sube-menu-${grade}-${cleanBranch}`);
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    const detailPanel = document.getElementById('grade-detail-panel');
    if (!detailPanel) return;
    detailPanel.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();

    detailPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${grade}. Sınıf - ${branchName}</h1></div>
            <div>
                <button onclick="openGradeManagement('${grade}', true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Geri</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <h2 style="margin-bottom: 15px; color: #f8fafc; font-size: 16px;">Yönetim Kartları</h2>
            <div class="grade-cards-grid">
                <div class="grade-card" onclick="openBranchDetail('${grade}', '${branchName}', 'students', true)" style="border-top-color: #3b82f6;">
                    <div style="font-size: 24px; margin-bottom: 6px;">👥</div>
                    <h3>Sınıf Listesi & Artı/Eksi</h3>
                    <p>Öğrenci performans takibi</p>
                    <span class="card-action">Git &rarr;</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}', '${branchName}', 'quizzes', true)" style="border-top-color: #8b5cf6;">
                    <div style="font-size: 24px; margin-bottom: 6px;">📝</div>
                    <h3>Quiz Sonuçları</h3>
                    <p>Değerlendirme ve not girişleri</p>
                    <span class="card-action">Git &rarr;</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}', '${branchName}', 'activities', true)" style="border-top-color: #10b981;">
                    <div style="font-size: 24px; margin-bottom: 6px;">🧪</div>
                    <h3>Etkinlik Ölçekleri</h3>
                    <p>Toplu ölçek ve rubrikler</p>
                    <span class="card-action">Git &rarr;</span>
                </div>
                <div class="grade-card" onclick="openBranchDetail('${grade}', '${branchName}', 'reports', true)" style="border-top-color: #f59e0b;">
                    <div style="font-size: 24px; margin-bottom: 6px;">📊</div>
                    <h3>Raporlar & Analiz</h3>
                    <p>Karne özeti ve resmi raporlar</p>
                    <span class="card-action">Git &rarr;</span>
                </div>
            </div>
        </section>
    `;
}

function openBranchDetail(grade, branchName, tab = 'students', push = true) {
    renderBranchDetailView(grade, branchName, tab, push);
}

function renderBranchDetailView(grade, branchName, tab = 'students', push = true) {
    const state = { type: 'branch-detail', grade, branchName, tab };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) {
        const cleanBranch = branchName.replace('/', '-');
        history.pushState(state, '', `#sube-${grade}-${cleanBranch}-${tab}`);
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('student-panel').style.display = 'none';
    const detailPanel = document.getElementById('grade-detail-panel');
    if (!detailPanel) return;
    detailPanel.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();

    detailPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${grade}. Sınıf - ${branchName}</h1></div>
            <div>
                <button onclick="openBranchMenu('${grade}', '${branchName}', true)" class="logout-btn" style="background:#3b82f6; margin-right:6px;">Menü</button>
                <button onclick="logout()" class="logout-btn">Çıkış</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div id="branch-tab-content" style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);"></div>
        </section>
    `;
    
    loadBranchTabContent(tab, grade, branchName);
}

function loadBranchTabContent(tabType, grade, branchName) {
    const contentArea = document.getElementById('branch-tab-content');
    if (!contentArea) return;
    const classUnits = fenData[grade]?.units || [];

    let unitOptions = '<option value="">-- Ünite Seçin --</option>';
    classUnits.forEach(u => { unitOptions += `<option value="${u.name}">${u.name}</option>`; });

    if (tabType === 'students') {
        const students = fenData[grade]?.branches[branchName] || [];
        let rows = '';
        students.forEach((s, idx) => {
            rows += `<tr>
                <td>${s.no}</td><td>${s.name}</td>
                <td><button onclick="updatePoint('${grade}', '${branchName}', ${idx}, 'plus', 1)" style="background:#10b981; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">+</button> ${s.plus}</td>
                <td><button onclick="updatePoint('${grade}', '${branchName}', ${idx}, 'minus', 1)" style="background:#ef4444; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">-</button> ${s.minus}</td>
                <td><button onclick="deleteStudent('${grade}', '${branchName}', ${idx})" style="background:#64748b; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">Sil</button></td>
            </tr>`;
        });

        contentArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <h3 style="color:#f8fafc; font-size:15px; margin:0;">Öğrenci Listesi</h3>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button onclick="openBulkStudentModal('${grade}', '${branchName}')" class="auth-btn" style="width:auto; padding:6px 10px; background:#059669; font-size:11px;">📋 e-Okul Yapıştır</button>
                    <button onclick="addStudentModal('${grade}', '${branchName}')" class="auth-btn" style="width:auto; padding:6px 10px; background:#2563eb; font-size:11px;">+ Öğrenci</button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="export-target-table">
                    <thead><tr><th>No</th><th>Ad Soyad</th><th>Artı</th><th>Eksi</th><th>İşlem</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Öğrenci bulunmuyor.</td></tr>'}</tbody>
                </table>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
                <button onclick="exportTableToWord('export-target-table', '${branchName}_Ogrenci_Listesi')" class="auth-btn" style="background:#2563eb; width:auto; padding:6px 12px; font-size:11px;">📥 Word İndir</button>
            </div>
        `;
    } else if (tabType === 'quizzes') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc; font-size:15px; margin-bottom:4px;">📝 Quiz Sonuçları</h3>
            <p style="color: #94a3b8; margin-top: 0; font-size: 11px;">Ünite ve bölüm seçerek not girin.</p>
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-direction: column;">
                <select id="quiz-unit-sel" class="auth-input" onchange="loadSectionsForQuiz(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="quiz-section-select" class="auth-input" onchange="renderQuizTable('${grade}', '${branchName}')"><option value="">-- Önce Ünite Seçin --</option></select>
            </div>
            <div id="quiz-table-container" style="margin-top:12px;"></div>
        `;
    } else if (tabType === 'activities') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc; font-size:15px; margin-bottom:4px;">🧪 Etkinlik Puanlama</h3>
            <p style="color: #94a3b8; margin-top: 0; font-size: 11px;">Ünite, bölüm ve etkinlik seçin.</p>
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-direction: column;">
                <select id="act-unit-sel" class="auth-input" onchange="loadSectionsForActivity(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="activity-section-select" class="auth-input" onchange="loadBaseActivitiesForSelection('${grade}', '${branchName}')"><option value="">-- Bölüm Seçin --</option></select>
                <select id="activity-name-select" class="auth-input" onchange="loadSubScalesForSelection('${grade}', '${branchName}')"><option value="">-- Etkinlik Seçin --</option></select>
                <select id="sub-scale-select" class="auth-input" onchange="renderGroupedActivityTable('${grade}', '${branchName}')"><option value="-- TÜM ÖLÇEKLER --">-- Tüm Ölçekler --</option></select>
            </div>
            <div id="activity-table-container" style="margin-top:12px;"></div>
        `;
    } else if (tabType === 'reports') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc; font-size:15px; margin-bottom:4px;">📊 Şube Raporları</h3>
            <p style="color: #94a3b8; margin-top: 0; font-size: 11px;">Ünite ve bölüm seçerek karne analizi görün.</p>
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-direction: column;">
                <select id="rep-unit-sel" class="auth-input" onchange="loadSectionsForReport(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="report-section-select" class="auth-input" onchange="renderReportData('${grade}', '${branchName}')"><option value="">-- Bölüm Seçin --</option></select>
            </div>
            <div id="report-result-container" style="margin-top:12px;"></div>
        `;
    }
}

function exportTableToWord(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) { alert('İçerik bulunamadı!'); return; }
    
    const styles = `
        <style>
            @page Section1 { size: 21.0cm 29.7cm; margin: 1.5cm; }
            div.Section1 { page: Section1; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; }
            table { width: 100% !important; border-collapse: collapse !important; margin-top: 10px; table-layout: fixed; }
            th, td { border: 1px solid #000 !important; padding: 5px 3px !important; font-size: 9px !important; text-align: center; word-wrap: break-word; overflow: hidden; }
            th { background-color: #f2f2f2 !important; font-weight: bold; }
            td:nth-child(2) { text-align: left !important; }
        </style>
    `;

    const htmlHeader = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Rapor</title>${styles}</head><body><div class="Section1">`;
    const htmlFooter = "</div></body></html>";
    const completeHtml = htmlHeader + element.outerHTML + htmlFooter;
    
    const blob = new Blob(['\ufeff' + completeHtml], { type: 'application/msword' });
    saveAs(blob, filename + ".doc");
}

function openBulkStudentModal(grade, branchName) {
    const content = `
        <p style="color:#cbd5e1; font-size:12px; margin-bottom:8px;">e-Okul listesini kopyalayıp yapıştırın:</p>
        <textarea id="bulk-student-text" class="auth-input" style="height:140px; font-family:monospace; font-size:11px;" placeholder="2\tMUHAMMED HALİL...\n29\tİREM DİNÇ..."></textarea>
    `;

    openModal(`Toplu Öğrenci Aktar (${branchName})`, content, async () => {
        const rawText = document.getElementById('bulk-student-text').value.trim();
        if (!rawText) { alert('Liste yapıştırın!'); return; }

        const lines = rawText.split('\n');
        let addedCount = 0;

        for (let line of lines) {
            let parts = line.split('\t');
            if (parts.length < 2) parts = line.trim().split(/\s{2,}/);

            if (parts.length >= 2) {
                let schoolNo = parseInt(parts[0].trim());
                let studentName = parts[1].trim().toUpperCase();

                if (!isNaN(schoolNo) && studentName) {
                    if (supabaseClient) {
                        await supabaseClient.from('students').insert([{
                            grade: grade,
                            branch: branchName,
                            school_no: schoolNo,
                            name: studentName,
                            plus: 0, minus: 0, quiz: {}, scale: {}
                        }]);
                    }
                    addedCount++;
                }
            }
        }

        await loadAllDataFromSupabase();
        if (fenData[grade]?.branches[branchName]) {
            fenData[grade].branches[branchName].sort((a, b) => parseInt(a.no) - parseInt(b.no));
        }

        alert(`${addedCount} öğrenci eklendi!`);
        closeModal();
        openBranchDetail(grade, branchName, 'students', false);
    });
}

function loadSectionsForQuiz(unitName, grade, branchName) {
    const secSel = document.getElementById('quiz-section-select');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) unit.sections.forEach(s => secSel.innerHTML += `<option value="${s}">${s}</option>`);
    renderQuizTable(grade, branchName);
}

function renderQuizTable(grade, branchName) {
    const unitName = document.getElementById('quiz-unit-sel')?.value;
    const secName = document.getElementById('quiz-section-select')?.value;
    const container = document.getElementById('quiz-table-container');
    if (!container) return;

    if (!unitName || !secName) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:12px;">Lütfen ünite ve bölüm seçin.</p>';
        return;
    }

    const students = fenData[grade]?.branches[branchName] || [];
    let rows = '';
    students.forEach((s, idx) => {
        const key = `${unitName}_${secName}`;
        const currentScore = s.quiz?.[key] ?? '';
        
        rows += `<tr>
            <td style="text-align: center;">${s.no}</td>
            <td style="font-weight: 600; text-align: left;">${s.name}</td>
            <td style="text-align: center;"><input type="number" id="quiz-score-${idx}" class="auth-input" style="padding: 4px; width: 65px; margin: 0 auto; text-align:center;" value="${currentScore}" placeholder="Not" onwheel="this.blur()"></td>
        </tr>`;
    });

    container.innerHTML = `
        <div id="quiz-printable-area" style="background: #ffffff; color: #000; padding: 15px; border-radius: 10px;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
                <h2 style="font-size: 14px; font-weight: bold; margin: 0 0 3px 0;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3 style="font-size: 12px; font-weight: bold; margin: 0;">${grade}. SINIF (${branchName}) - QUİZ DEĞERLENDİRME RAPORU</h3>
            </div>
            <div style="border: 1px solid #000; padding: 8px; margin-bottom: 12px; font-size: 11px;">
                <p style="margin: 2px 0;"><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p style="margin: 2px 0;"><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="export-quiz-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f2f2f2;">
                            <th style="text-align: center; width: 20%;">NO</th>
                            <th style="text-align: left; width: 50%;">AD SOYAD</th>
                            <th style="text-align: center; width: 30%;">QUİZ NOTU</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Öğrenci yok.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button onclick="saveQuizScores('${grade}', '${branchName}')" class="auth-btn" style="width:auto; padding:8px 14px; font-size:12px;">Notları Kaydet</button>
            <button onclick="exportTableToWord('quiz-printable-area', '${branchName}_Quiz_Sonuclari')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px; font-size:12px;">📥 Word İndir</button>
        </div>
    `;
}

async function saveQuizScores(grade, branchName) {
    const unitName = document.getElementById('quiz-unit-sel').value;
    const secName = document.getElementById('quiz-section-select').value;
    const students = fenData[grade].branches[branchName];

    for (let idx = 0; idx < students.length; idx++) {
        const s = students[idx];
        const inputEl = document.getElementById(`quiz-score-${idx}`);
        if (!inputEl) continue;
        const inputVal = inputEl.value;
        if (!s.quiz) s.quiz = {};
        s.quiz[`${unitName}_${secName}`] = inputVal;
        
        if (supabaseClient) {
            await supabaseClient.from('students').update({ quiz: s.quiz }).eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }

    await loadAllDataFromSupabase();
    alert('Quiz notları kaydedildi!');
}

function loadSectionsForActivity(unitName, grade, branchName) {
    const secSel = document.getElementById('activity-section-select');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) unit.sections.forEach(s => secSel.innerHTML += `<option value="${s}">${s}</option>`);
    loadBaseActivitiesForSelection(grade, branchName);
}

function loadBaseActivitiesForSelection(grade, branchName) {
    const unitName = document.getElementById('act-unit-sel')?.value;
    const secName = document.getElementById('activity-section-select')?.value;
    const actSel = document.getElementById('activity-name-select');
    if (!actSel) return;

    actSel.innerHTML = '<option value="">-- Etkinlik Seçin --</option>';
    const acts = fenData[grade]?.activities || [];
    
    let baseActivityNames = new Set();
    acts.filter(a => a.unit === unitName && a.section === secName).forEach(a => {
        let cleanName = a.name.trim();
        let parts = cleanName.split(' - ');
        if (parts.length >= 2) {
            baseActivityNames.add(`${parts[0]} - ${parts[1]}`);
        } else {
            baseActivityNames.add(cleanName);
        }
    });

    baseActivityNames.forEach(bAct => {
        actSel.innerHTML += `<option value="${bAct}">${bAct}</option>`;
    });

    loadSubScalesForSelection(grade, branchName);
}

function loadSubScalesForSelection(grade, branchName) {
    const unitName = document.getElementById('act-unit-sel')?.value;
    const secName = document.getElementById('activity-section-select')?.value;
    const baseActName = document.getElementById('activity-name-select')?.value;
    const subScaleSel = document.getElementById('sub-scale-select');
    if (!subScaleSel) return;

    subScaleSel.innerHTML = '<option value="-- TÜM ÖLÇEKLER --">-- Tüm Ölçekler --</option>';
    if (!baseActName) {
        renderGroupedActivityTable(grade, branchName);
        return;
    }

    const allActs = fenData[grade].activities || [];
    const subScales = allActs.filter(a => a.unit === unitName && a.section === secName && (a.name === baseActName || a.name.startsWith(baseActName + ' -')));

    subScales.forEach(scale => {
        let shortName = scale.name.replace(baseActName, '').replace(/^[\s-]+/, '');
        if (!shortName) shortName = scale.name;
        subScaleSel.innerHTML += `<option value="${scale.name}">${shortName}</option>`;
    });

    renderGroupedActivityTable(grade, branchName);
}

function renderGroupedActivityTable(grade, branchName) {
    const unitName = document.getElementById('act-unit-sel')?.value;
    const secName = document.getElementById('activity-section-select')?.value;
    const baseActName = document.getElementById('activity-name-select')?.value;
    const selectedScaleName = document.getElementById('sub-scale-select')?.value;
    const container = document.getElementById('activity-table-container');
    if (!container) return;

    if (!baseActName) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:12px;">Lütfen etkinlik seçin.</p>';
        return;
    }

    const allActs = fenData[grade].activities || [];
    const subScales = allActs.filter(a => a.unit === unitName && a.section === secName && (a.name === baseActName || a.name.startsWith(baseActName + ' -')));

    if (subScales.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:12px;">Ölçek bulunamadı.</p>';
        return;
    }

    if (selectedScaleName && selectedScaleName !== '-- TÜM ÖLÇEKLER --') {
        const scaleObj = subScales.find(a => a.name === selectedScaleName);
        if (!scaleObj) return;

        const criteria = scaleObj.criteria || ['1. Kriter', '2. Kriter', '3. Kriter', '4. Kriter'];
        const scaleType = scaleObj.scale_type || '1-4';
        const students = fenData[grade]?.branches[branchName] || [];

        let headerTh = '<th>No</th><th>Ad Soyad</th>';
        criteria.forEach(c => { headerTh += `<th>${c}</th>`; });
        headerTh += '<th>Başarı</th>';

        let rows = '';
        students.forEach((s) => {
            let cols = `<td>${s.no}</td><td style="font-weight: 600;">${s.name}</td>`;
            let storedScale = s.scale?.[selectedScaleName];
            
            if (!storedScale || storedScale['totalScore'] === undefined) {
                criteria.forEach(() => { cols += `<td><span style="color:#94a3b8;">-</span></td>`; });
                cols += `<td><b style="color:#94a3b8;">%-%</b></td>`;
            } else {
                criteria.forEach((c, cIdx) => {
                    let val = storedScale[cIdx] !== undefined ? storedScale[cIdx] : (scaleType === '1-4' ? 4 : 1);
                    let textLabel = val;
                    if (scaleType === '1-4') {
                        if (val == 4) textLabel = '4';
                        else if (val == 3) textLabel = '3';
                        else if (val == 2) textLabel = '2';
                        else if (val == 1) textLabel = '1';
                    } else if (scaleType === 'var-yok') textLabel = val == 1 ? 'Var' : 'Yok';
                    else textLabel = val == 1 ? 'Evet' : 'Hayır';

                    cols += `<td><span style="color:#38bdf8;">${textLabel}</span></td>`;
                });
                cols += `<td><b style="color:#34d399;">%${storedScale['totalScore']}</b></td>`;
            }
            rows += `<tr>${cols}</tr>`;
        });

        container.innerHTML = `
            <div id="activity-printable-area" style="background: #ffffff; color: #000; padding: 15px; border-radius: 10px;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
                    <h2 style="font-size: 14px; font-weight: bold; margin: 0 0 3px 0;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                    <h3 style="font-size: 12px; font-weight: bold; margin: 0;">${grade}. SINIF (${branchName}) - TEKİL ÖLÇEK RAPORU</h3>
                </div>
                <div style="border: 1px solid #000; padding: 8px; margin-bottom: 12px; font-size: 11px;">
                    <p style="margin: 2px 0;"><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                    <p style="margin: 2px 0;"><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
                    <p style="margin: 2px 0;"><b>Ölçek Adı:</b> ${scaleObj.name}</p>
                </div>
                <div class="table-responsive">
                    <table class="data-table" id="export-activity-table" style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="background: #f2f2f2;">${headerTh}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
                <button onclick="exportTableToWord('activity-printable-area', '${branchName}_Olcek')" class="auth-btn" style="background:#2563eb; width:auto; padding:6px 12px; font-size:11px;">📥 Word İndir</button>
            </div>
        `;
        return;
    }

    const students = fenData[grade]?.branches[branchName] || [];

    let headerTh = '<th>No</th><th>Ad Soyad</th><th>⚡ PUAN</th>';
    subScales.forEach(scale => {
        let shortName = scale.name.replace(baseActName, '').replace(/^[\s-]+/, '');
        if (!shortName) shortName = scale.name;
        headerTh += `<th>${shortName}</th>`;
    });

    let rows = '';
    students.forEach((s, sIdx) => {
        let cols = `<td>${s.no}</td><td style="font-weight: 600;">${s.name}</td>`;
        
        cols += `<td>
            <input type="number" id="group-quick-input-${sIdx}" class="auth-input" style="padding:4px; width:70px; font-size:11px; text-align:center; display:block; margin:0 auto;" min="0" max="100" placeholder="85" oninput="autoApplyScoreToSubScales(${sIdx}, '${baseActName.replace(/'/g, "\\\\'")}', ${subScales.length})" onwheel="this.blur()">
        </td>`;

        subScales.forEach((scale, scaleIdx) => {
            let hasScore = s.scale?.[scale.name] && s.scale[scale.name]['totalScore'] !== undefined && s.scale[scale.name]['totalScore'] !== '';
            let scVal = hasScore ? s.scale[scale.name]['totalScore'] : '-';
            let displayVal = scVal !== '-' ? `%${scVal}` : '%-%';
            cols += `<td><span id="scale-badge-${sIdx}-${scaleIdx}" style="color:${scVal !== '-' ? '#38bdf8' : '#94a3b8'}; font-weight:600;">${displayVal}</span></td>`;
        });

        rows += `<tr>${cols}</tr>`;
    });

    container.innerHTML = `
        <div id="activity-printable-area" style="background: #ffffff; color: #000; padding: 15px; border-radius: 10px;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
                <h2 style="font-size: 14px; font-weight: bold; margin: 0 0 3px 0;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3 style="font-size: 12px; font-weight: bold; margin: 0;">${grade}. SINIF (${branchName}) - TÜM ÖLÇEKLER RAPORU</h3>
            </div>
            <div style="border: 1px solid #000; padding: 8px; margin-bottom: 12px; font-size: 11px;">
                <p style="margin: 2px 0;"><b>Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p style="margin: 2px 0;"><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="export-activity-table" style="width: 100%; border-collapse: collapse;">
                    <thead><tr style="background: #f2f2f2;">${headerTh}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button onclick="saveGroupScaleScores('${grade}', '${branchName}', '${baseActName.replace(/'/g, "\\\\'")}')" class="auth-btn" style="width:auto; padding:8px 14px; font-size:12px;">Puanları Kaydet</button>
            <button onclick="exportTableToWord('activity-printable-area', '${branchName}_Tum_Olcekler')" class="auth-btn" style="background:#2563eb; width:auto; padding:6px 12px; font-size:11px;">📥 Word İndir</button>
        </div>
    `;
}

function autoApplyScoreToSubScales(sIdx, baseActName, subScalesCount) {
    const inputEl = document.getElementById(`group-quick-input-${sIdx}`);
    if (!inputEl) return;
    const targetVal = parseFloat(inputEl.value);
    
    for (let scaleIdx = 0; scaleIdx < subScalesCount; scaleIdx++) {
        const badgeEl = document.getElementById(`scale-badge-${sIdx}-${scaleIdx}`);
        if (badgeEl) {
            if (!isNaN(targetVal) && targetVal >= 0 && targetVal <= 100) {
                badgeEl.innerText = `%${Math.round(targetVal)}`;
                badgeEl.style.color = '#38bdf8';
            } else {
                badgeEl.innerText = '%-%';
                badgeEl.style.color = '#94a3b8';
            }
        }
    }
}

async function saveGroupScaleScores(grade, branchName, baseActName) {
    const unitName = document.getElementById('act-unit-sel').value;
    const secName = document.getElementById('activity-section-select').value;
    const allActs = fenData[grade].activities || [];
    const subScales = allActs.filter(a => a.unit === unitName && a.section === secName && (a.name === baseActName || a.name.startsWith(baseActName + ' -')));
    const students = fenData[grade].branches[branchName];

    for (let sIdx = 0; sIdx < students.length; sIdx++) {
        const s = students[sIdx];
        const inputEl = document.getElementById(`group-quick-input-${sIdx}`);
        if (!inputEl || inputEl.value === '') continue;

        let targetVal = parseFloat(inputEl.value);
        if (isNaN(targetVal)) continue;

        if (!s.scale) s.scale = {};

        subScales.forEach(scale => {
            if (!s.scale[scale.name]) s.scale[scale.name] = {};
            const criteriaCount = scale.criteria?.length || 4;
            
            if (scale.scale_type === '1-4') {
                let maxTotal = criteriaCount * 4;
                let targetScore = Math.round((targetVal / 100) * maxTotal);
                let baseVal = Math.floor(targetScore / criteriaCount);
                let remainder = targetScore % criteriaCount;

                for (let cIdx = 0; cIdx < criteriaCount; cIdx++) {
                    let val = baseVal + (cIdx < remainder ? 1 : 0);
                    if (val < 1) val = 1; if (val > 4) val = 4;
                    s.scale[scale.name][cIdx] = val;
                }
            } else {
                let targetScore = Math.round((targetVal / 100) * criteriaCount);
                for (let cIdx = 0; cIdx < criteriaCount; cIdx++) {
                    s.scale[scale.name][cIdx] = cIdx < targetScore ? 1 : 0;
                }
            }
            s.scale[scale.name]['totalScore'] = Math.round(targetVal);
        });

        if (supabaseClient) {
            await supabaseClient.from('students').update({ scale: s.scale }).eq('grade', grade).eq('branch', branchName).eq('school_no', s.no);
        }
    }

    await loadAllDataFromSupabase();
    alert('Puanlar kaydedildi!');
}

function loadSectionsForReport(unitName, grade, branchName) {
    const secSel = document.getElementById('report-section-select');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
    const unit = fenData[grade]?.units.find(u => u.name === unitName);
    if (unit && unit.sections) unit.sections.forEach(s => secSel.innerHTML += `<option value="${s}">${s}</option>`);
    renderReportData(grade, branchName);
}

async function renderReportData(grade, branchName) {
    const unitName = document.getElementById('rep-unit-sel')?.value;
    const secName = document.getElementById('report-section-select')?.value;
    const container = document.getElementById('report-result-container');
    if (!container) return;

    if (!unitName || !secName) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:12px;">Lütfen ünite ve bölüm seçin.</p>';
        return;
    }

    let customReportText = "Bu bölüm için henüz resmi rapor şablonu eklenmemiş.";
    if (supabaseClient) {
        const { data, error } = await supabaseClient
            .from('report_templates')
            .select('report_text')
            .eq('grade', grade)
            .eq('unit_name', unitName)
            .eq('section_name', secName)
            .single();
        if (!error && data && data.report_text) {
            customReportText = data.report_text;
        }
    }

    const students = fenData[grade]?.branches[branchName] || [];
    const allActs = fenData[grade]?.activities || [];
    const sectionActivities = allActs.filter(a => a.unit === unitName && a.section === secName);

    let headerTh = '<th>No</th><th>Ad Soyad</th><th>Quiz</th><th>Ölçek</th><th>Genel</th>';

    let allGradesForStats = [];
    let allScaleScoresForStats = [];
    let allQuizScoresForStats = [];
    let rows = '';

    students.forEach((s) => {
        const quizKey = `${unitName}_${secName}`;
        const qScore = s.quiz?.[quizKey] !== undefined && s.quiz[quizKey] !== '' ? parseFloat(s.quiz[quizKey]) : null;

        if (qScore !== null) allQuizScoresForStats.push(qScore);

        let cols = `<td>${s.no}</td><td style="font-weight: 600;">${s.name}</td>`;
        cols += `<td>${qScore !== null ? qScore : '-'}</td>`;

        let scaleScoreSum = 0;
        let scaleScoreCount = 0;

        sectionActivities.forEach(act => {
            const scaleData = s.scale?.[act.name];
            const actScore = scaleData && scaleData['totalScore'] !== undefined ? parseFloat(scaleData['totalScore']) : null;
            if (actScore !== null) {
                scaleScoreSum += actScore;
                scaleScoreCount++;
            }
        });

        let sectionScaleAvg = scaleScoreCount > 0 ? Math.round(scaleScoreSum / scaleScoreCount) : null;
        if (sectionScaleAvg !== null) {
            allScaleScoresForStats.push(sectionScaleAvg);
            cols += `<td><b>%${sectionScaleAvg}</b></td>`;
        } else {
            cols += `<td style="color: #64748b;">-</td>`;
        }

        let generalAvg = null;
        if (qScore !== null && sectionScaleAvg !== null) {
            generalAvg = Math.round((qScore * 0.5) + (sectionScaleAvg * 0.5));
        } else if (qScore !== null) {
            generalAvg = Math.round(qScore);
        } else if (sectionScaleAvg !== null) {
            generalAvg = Math.round(sectionScaleAvg);
        }

        if (generalAvg !== null) {
            allGradesForStats.push(generalAvg);
            cols += `<td><b style="color:#059669;">%${generalAvg}</b></td>`;
        } else {
            cols += `<td><b style="color:#64748b;">-%</b></td>`;
        }

        rows += `<tr>${cols}</tr>`;
    });

    let classQuizAvg = allQuizScoresForStats.length > 0 ? Math.round(allQuizScoresForStats.reduce((a, b) => a + b, 0) / allQuizScoresForStats.length) : '-';
    let classScaleAvg = allScaleScoresForStats.length > 0 ? '%' + Math.round(allScaleScoresForStats.reduce((a, b) => a + b, 0) / allScaleScoresForStats.length) : '-';

    let countLow = allGradesForStats.filter(g => g < 45).length;
    let countMid = allGradesForStats.filter(g => g >= 45 && g < 70).length;
    let countHigh = allGradesForStats.filter(g => g >= 70).length;

    container.innerHTML = `
        <div id="report-printable-area" style="background: #ffffff; color: #000; padding: 20px; border-radius: 10px; font-family: 'Times New Roman', serif;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                <h2 style="font-size: 15px; font-weight: bold; margin: 0 0 4px 0;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                <h3 style="font-size: 13px; font-weight: bold; margin: 0;">${grade}. SINIF (${branchName}) - ÜNİTE VE BÖLÜM ANALİZİ & KARNE RAPORU</h3>
            </div>
            <div style="border: 1px solid #000; padding: 10px; margin-bottom: 15px; font-size: 11px;">
                <p style="margin: 2px 0;"><b>Sınıf / Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p style="margin: 2px 0;"><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
                <p style="margin: 2px 0;"><b>Mevcut:</b> ${students.length} Öğrenci | <b>Quiz Ort.:</b> ${classQuizAvg} | <b>Ölçek Ort.:</b> ${classScaleAvg}</p>
            </div>
            <div class="table-responsive">
                <table class="data-table" id="export-report-table" style="width: 100%; border-collapse: collapse; background: #fff; color: #000;">
                    <thead><tr style="background: #f2f2f2;">${headerTh}</tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Öğrenci bulunmuyor.</td></tr>'}</tbody>
                </table>
            </div>
            <div style="margin-top: 15px; border: 1px solid #000; padding: 12px; border-radius: 6px; background: #fafafa;">
                <h4 style="font-size: 12px; font-weight: bold; margin: 0 0 6px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">📌 Bölüm Sonu Resmi Değerlendirme Raporu</h4>
                <p style="font-size: 11px; line-height: 1.4; margin: 0; white-space: pre-wrap;">${customReportText}</p>
            </div>
            <div style="margin-top: 15px; border: 1px solid #000; padding: 10px; font-size: 11px; display: flex; justify-content: space-around; text-align: center;">
                <div><b>0-45 Altı:</b> ${countLow} Öğrenci</div>
                <div><b>45-70 Arası:</b> ${countMid} Öğrenci</div>
                <div><b>70-100 Arası:</b> ${countHigh} Öğrenci</div>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
            <button onclick="exportTableToWord('report-printable-area', '${branchName}_${secName}_Analiz_Raporu')" class="auth-btn" style="background:#2563eb; width:auto; padding:8px 14px; font-size:12px;">📥 Word İndir</button>
        </div>
    `;
}

function addStudentModal(grade, branchName) {
    const content = `
        <label style="color:#cbd5e1; font-size:12px;">Okul No:</label><input type="number" id="s-no" class="auth-input" style="margin-bottom:8px;">
        <label style="color:#cbd5e1; font-size:12px;">Ad Soyad:</label><input type="text" id="s-name" class="auth-input">
    `;
    openModal("Öğrenci Ekle", content, async () => {
        const noInput = document.getElementById('s-no').value.trim();
        const name = document.getElementById('s-name').value.trim().toUpperCase();
        
        if (!noInput || !name) { alert('Alanları doldurun.'); return; }
        const no = parseInt(noInput);

        if (supabaseClient) {
            await supabaseClient.from('students').insert([{
                grade: grade, branch: branchName, school_no: no, name: name, plus: 0, minus: 0, quiz: {}, scale: {}
            }]);
        }

        await loadAllDataFromSupabase();
        if (fenData[grade]?.branches[branchName]) {
            fenData[grade].branches[branchName].sort((a, b) => parseInt(a.no) - parseInt(b.no));
        }

        alert('Öğrenci eklendi!');
        closeModal();
        openBranchDetail(grade, branchName, 'students', false);
    });
}

async function updatePoint(grade, branchName, index, type, val) {
    const students = fenData[grade].branches[branchName];
    const student = students[index];
    if (type === 'plus') student.plus += val;
    else student.minus += val;

    if (supabaseClient) {
        await supabaseClient.from('students').update({ plus: student.plus, minus: student.minus }).eq('grade', grade).eq('branch', branchName).eq('school_no', student.no);
    }

    await loadAllDataFromSupabase();
    openBranchDetail(grade, branchName, 'students', false);
}

async function deleteStudent(grade, branchName, index) {
    const student = fenData[grade].branches[branchName][index];
    if (supabaseClient) {
        await supabaseClient.from('students').delete().eq('grade', grade).eq('branch', branchName).eq('school_no', student.no);
    }
    await loadAllDataFromSupabase();
    openBranchDetail(grade, branchName, 'students', false);
}

async function studentLogin(push = true) {
    const grade = document.getElementById('student-grade').value;
    const branch = document.getElementById('student-branch').value;
    const numberInput = document.getElementById('student-number').value.trim();
    const nameInput = document.getElementById('student-name').value.trim().toUpperCase();

    if (!grade || !branch || !numberInput || !nameInput) {
        alert('Lütfen tüm alanları doldurun.');
        return;
    }

    const schoolNo = parseInt(numberInput);
    let foundStudent = null;

    await loadAllDataFromSupabase();

    if (fenData[grade] && fenData[grade].branches && fenData[grade].branches[branch]) {
        const localStudent = fenData[grade].branches[branch].find(
            s => parseInt(s.no) === schoolNo && s.name.trim().toUpperCase() === nameInput
        );
        if (localStudent) foundStudent = localStudent;
    }

    if (!foundStudent) {
        alert('Giriş Başarısız: Öğrenci bulunamadı.');
        return;
    }

    renderStudentPanelView(grade, branch, foundStudent, push);
}

function renderStudentPanelView(grade, branch, student, push = true) {
    const state = { type: 'student', grade, branch, student };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) history.pushState(state, '', '#ogrenci-paneli');

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    const studentPanel = document.getElementById('student-panel');
    if (!studentPanel) return;
    studentPanel.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();

    const classUnits = fenData[grade]?.units || [];

    let quizRows = '';
    let totalQuizScore = 0;
    let quizCount = 0;

    classUnits.forEach(u => {
        if (u.sections) {
            u.sections.forEach(sec => {
                let qKey = `${u.name}_${sec}`;
                if (student.quiz && student.quiz[qKey] !== undefined && student.quiz[qKey] !== '') {
                    let score = student.quiz[qKey];
                    quizRows += `<tr>
                        <td style="padding:6px; text-align:left;"><b>${u.name}</b> / ${sec}</td>
                        <td style="padding:6px; text-align:center; color:#0284c7;"><b>${score} Puan</b></td>
                    </tr>`;
                    totalQuizScore += parseFloat(score);
                    quizCount++;
                }
            });
        }
    });
    let avgQuiz = quizCount > 0 ? Math.round(totalQuizScore / quizCount) : 0;

    let scaleRows = '';
    let totalScaleScore = 0;
    let scaleCount = 0;

    classUnits.forEach(u => {
        if (u.sections) {
            u.sections.forEach(sec => {
                const actsInSec = (fenData[grade]?.activities || []).filter(a => a.unit === u.name && a.section === sec);
                let secScoreSum = 0;
                let secScoreCount = 0;

                actsInSec.forEach(act => {
                    let scaleObj = student.scale?.[act.name];
                    if (scaleObj && scaleObj['totalScore'] !== undefined) {
                        secScoreSum += parseFloat(scaleObj['totalScore']);
                        secScoreCount++;
                    }
                });

                if (secScoreCount > 0) {
                    let secAvg = Math.round(secScoreSum / secScoreCount);
                    scaleRows += `<tr>
                        <td style="padding:6px; text-align:left;"><b>${u.name}</b> / ${sec}</td>
                        <td style="padding:6px; text-align:center;"><b style="color:#0284c7;">%${secAvg}</b></td>
                    </tr>`;
                    totalScaleScore += secAvg;
                    scaleCount++;
                }
            });
        }
    });
    let avgScale = scaleCount > 0 ? Math.round(totalScaleScore / scaleCount) : 0;

    let generalAvg = 0;
    if (quizCount > 0 && scaleCount > 0) generalAvg = Math.round((avgQuiz * 0.5) + (avgScale * 0.5));
    else if (quizCount > 0) generalAvg = avgQuiz;
    else if (scaleCount > 0) generalAvg = avgScale;

    let badgeHtml = generalAvg >= 85 ? 
        `<div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 12px; border-radius: 10px; color: white; text-align: center; margin-bottom: 15px;"><span style="font-size: 24px;">🏆</span><h3 style="margin: 4px 0 2px; font-size: 15px;">Fen Bilimleri Yıldızı</h3></div>` :
        generalAvg >= 70 ? `<div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 12px; border-radius: 10px; color: white; text-align: center; margin-bottom: 15px;"><span style="font-size: 24px;">⭐</span><h3 style="margin: 4px 0 2px; font-size: 15px;">Süper Başarı</h3></div>` : '';

    studentPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><h1>${student.name} (${branch})</h1></div>
            <div><button onclick="logoutStudent()" class="logout-btn">Çıkış</button></div>
        </header>
        <section class="dashboard-content" style="max-width: 600px; margin: 0 auto;">
            ${badgeHtml}

            <!-- KARNE ÖZETİ -->
            <div id="student-report-card" style="background: #ffffff; color: #000; padding: 15px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px;">
                    <h2 style="font-size: 14px; font-weight: bold; margin: 0 0 3px 0;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL EĞİTİM PORTALI</h2>
                    <h3 style="font-size: 12px; font-weight: bold; margin: 0;">ÖĞRENCİ GELİŞİM VE KARNE RAPORU</h3>
                </div>
                <div style="border: 1px solid #000; padding: 10px; border-radius: 6px; background: #fff; font-size: 12px;">
                    <p style="margin: 2px 0;"><b>Adı:</b> ${student.name}</p>
                    <p style="margin: 2px 0;"><b>No / Şube:</b> ${student.no} | ${grade}. Sınıf - ${branch}</p>
                    <p style="margin: 2px 0;"><b>Quiz Ort:</b> ${quizCount > 0 ? avgQuiz + ' Puan' : '-'}</p>
                    <p style="margin: 2px 0;"><b>Etkinlik Ort:</b> ${scaleCount > 0 ? '%' + avgScale : '-'}</p>
                    <p style="margin: 2px 0; font-weight: bold;"><b>Genel Puan:</b> %${generalAvg}</p>
                </div>
            </div>

            <!-- TABLO 1: QUİZLER (KAYDIRILABİLİR KUTU) -->
            <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 15px;">
                <h4 style="font-size: 13px; margin-bottom: 8px; color: #f8fafc;">📝 Quiz Sonuçlarım</h4>
                <div class="table-responsive">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="background:#f2f2f2;"><th style="text-align:left;">Ünite ve Bölüm</th><th style="text-align:center;">Not</th></tr></thead>
                        <tbody>${quizRows || '<tr><td colspan="2" style="text-align:center; color:#94a3b8;">Quiz notu yok.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

            <!-- TABLO 2: ETKİNLİKLER (KAYDIRILABİLİR KUTU) -->
            <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 15px;">
                <h4 style="font-size: 13px; margin-bottom: 8px; color: #f8fafc;">🧪 Etkinlik Ortalamalarım</h4>
                <div class="table-responsive">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="background:#f2f2f2;"><th style="text-align:left;">Ünite ve Bölüm</th><th style="text-align:center;">Ortalama</th></tr></thead>
                        <tbody>${scaleRows || '<tr><td colspan="2" style="text-align:center; color:#94a3b8;">Etkinlik yok.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

            <div style="display:flex; justify-content:center; margin-bottom: 20px;">
                <button onclick="exportTableToWord('student-report-card', '${student.name.replace(/\s+/g, '_')}_Karne')" class="auth-btn" style="background:#2563eb; width:auto; padding:10px 18px; font-size:13px;">📥 Karnemi Word İndir</button>
            </div>
        </section>
    `;
}