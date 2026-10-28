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

function restoreStateFromSession() {
    const savedState = sessionStorage.getItem('fen_app_state');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.type === 'teacher') {
                renderTeacherPanelView(false);
            } else if (state.type === 'grade-mgmt') {
                renderGradeManagementView(state.grade, false);
            } else if (state.type === 'branch-detail') {
                renderBranchDetailView(state.grade, state.branchName, state.tab || 'students', false);
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
    } else if (state.type === 'branch-detail') {
        renderBranchDetailView(state.grade, state.branchName, state.tab || 'students', false);
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
    const content = `<label style="color:#cbd5e1;">Şube Adı (Örn: A, B, F):</label><input type="text" id="modal-branch-name" class="auth-input" placeholder="A">`;
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
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:14px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:15px;">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:14px; color:#cbd5e1;">Ünite Adı:</label>
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
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:14px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:15px;" onchange="updateModalUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:14px; color:#cbd5e1;">Ünite Seçin:</label>
        <select id="modal-unit-select" class="auth-input" style="margin-bottom:15px;"><option value="">Önce sınıf seçin</option></select>
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:14px; color:#cbd5e1;">Bölüm / Konu Adı:</label>
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
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="rep-modal-grade" class="auth-input" style="margin-bottom:12px;" onchange="updateRepModalUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6">6. Sınıf</option><option value="7" selected>7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Ünite Seçin:</label>
        <select id="rep-modal-unit" class="auth-input" style="margin-bottom:12px;" onchange="updateRepModalSections(this.value)"><option value="">Önce sınıf seçin</option></select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Bölüm Seçin:</label>
        <select id="rep-modal-section" class="auth-input" style="margin-bottom:12px;"><option value="">Önce ünite seçin</option></select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Resmi Rapor Metni:</label>
        <textarea id="rep-modal-text" class="auth-input" style="height:150px; font-size:12px; font-family:monospace;" placeholder="Rapor metnini buraya yazın..."></textarea>
    `;

    openModal("Bölüme Özel Resmi Rapor Şablonu Ekle", content, async () => {
        const grade = document.getElementById('rep-modal-grade').value;
        const unitName = document.getElementById('rep-modal-unit').value;
        const secName = document.getElementById('rep-modal-section').value;
        const textInput = document.getElementById('rep-modal-text');
        const reportText = textInput.value.trim();

        if (!unitName || !secName || !reportText) {
            alert('Lütfen sınıf, ünite, bölüm seçin ve rapor metnini yazın!');
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
                alert('Rapor kaydedilirken hata: ' + error.message);
                return;
            }
        }

        textInput.value = '';
        closeModal();
        alert('Rapor şablonu buluta başarıyla kaydedildi!');
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
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="modal-grade" class="auth-input" style="margin-bottom:12px;" onchange="updateModalUnitsForActivity(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Ünite Seçin:</label>
        <select id="modal-unit" class="auth-input" style="margin-bottom:12px;" onchange="updateModalSectionsForActivity(this.value)">
            <option value="">Önce sınıf seçin</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Bölüm Seçin:</label>
        <select id="modal-section" class="auth-input" style="margin-bottom:12px;"><option value="">Önce ünite seçin</option></select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Excel Dosyası (.xlsx):</label>
        <input type="file" id="modal-excel-file" class="auth-input" accept=".xlsx, .xls, .csv" style="margin-bottom:12px;">
    `;

    openModal("Excel Çoklu Ölçek ve Tür Entegrasyonu", content, () => {
        const grade = document.getElementById('modal-grade').value;
        const unit = document.getElementById('modal-unit').value;
        const section = document.getElementById('modal-section').value;
        const fileInput = document.getElementById('modal-excel-file');
        const file = fileInput.files[0];

        if (!unit || !section || !file) {
            alert('Lütfen ünite, bölüm seçin ve bir Excel dosyası yükleyin!');
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
                                if (cell.includes('RUBRİK') || cell.includes('1-4')) {
                                    scaleType = '1-4';
                                } else if (cell.includes('KONTROL') || cell.includes('VAR') || cell.includes('YOK')) {
                                    scaleType = 'var-yok';
                                } else if (cell.includes('FORMU') || cell.includes('EVET') || cell.includes('HAYIR')) {
                                    scaleType = 'evet-hayir';
                                }

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
                alert(`Toplam ${importedCount} farklı ölçek başarıyla yüklendi!`);
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
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Sınıf Düzeyi Seçin:</label>
        <select id="del-grade" class="auth-input" style="margin-bottom:12px;" onchange="updateDelUnits(this.value)">
            <option value="5">5. Sınıf</option><option value="6" selected>6. Sınıf</option><option value="7">7. Sınıf</option><option value="8">8. Sınıf</option>
        </select>
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Silinecek Öğe Türü:</label>
        <select id="del-type" class="auth-input" style="margin-bottom:12px;" onchange="toggleDelFields()">
            <option value="unit">Ünite Sil (Tüm Bölüm ve Etkinlikleriyle)</option>
            <option value="section">Bölüm Sil</option>
            <option value="activity">Etkinlik / Ölçek Sil</option>
            <option value="report">Resmi Rapor Şablonu Sil</option>
        </select>

        <div id="del-unit-container" style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Ünite Seçin:</label>
            <select id="del-unit-select" class="auth-input" onchange="updateDelSections(this.value)"><option value="">-- Ünite Seçin --</option></select>
        </div>

        <div id="del-section-container" style="margin-bottom:12px; display:none;">
            <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Bölüm Seçin:</label>
            <select id="del-section-select" class="auth-input" onchange="updateDelActivitiesAndReports()"><option value="">-- Bölüm Seçin --</option></select>
        </div>

        <div id="del-activity-container" style="margin-bottom:12px; display:none;">
            <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Etkinlik / Ölçek Seçin:</label>
            <select id="del-activity-select" class="auth-input"><option value="">-- Önce Bölüm Seçin --</option></select>
        </div>

        <div id="del-report-container" style="margin-bottom:12px; display:none;">
            <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px; color:#cbd5e1;">Silinecek Rapor (Bölüm):</label>
            <select id="del-report-select" class="auth-input"><option value="">-- Önce Bölüm Seçin --</option></select>
        </div>
    `;

    openModal("İçerik Silme Yönetimi", content, async () => {
        const grade = document.getElementById('del-grade').value;
        const type = document.getElementById('del-type').value;

        if (type === 'unit') {
            const unitName = document.getElementById('del-unit-select').value;
            if (!unitName) { alert('Lütfen silinecek üniteyi seçin.'); return; }
            if (confirm(`"${unitName}" ünitesini, bu üniteye ait tüm bölümleri ve etkinlikleri silmek istiyor musunuz?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('units_sections').delete().eq('grade', grade).eq('unit_name', unitName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('unit_name', unitName);
                    await supabaseClient.from('report_templates').delete().eq('grade', grade).eq('unit_name', unitName);
                }
                await loadAllDataFromSupabase();
                updateDelUnits(grade);
                closeModal();
                alert('Ünite, bölümleri ve ilgili tüm etkinlik/raporlar buluttan silindi!');
            }
        } else if (type === 'section') {
            const unitName = document.getElementById('del-unit-select').value;
            const secName = document.getElementById('del-section-select').value;
            if (!unitName || !secName) { alert('Lütfen ünite ve bölüm seçin.'); return; }
            if (confirm(`"${secName}" bölümünü silmek istiyor musunuz?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('units_sections').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                    await supabaseClient.from('report_templates').delete().eq('grade', grade).eq('unit_name', unitName).eq('section_name', secName);
                }
                await loadAllDataFromSupabase();
                updateDelSections(unitName);
                closeModal();
                alert('Bölüm ve bağlı içerikler buluttan silindi!');
            }
        } else if (type === 'activity') {
            const actName = document.getElementById('del-activity-select').value;
            if (!actName) { alert('Lütfen silinecek etkinliği seçin.'); return; }
            if (confirm(`"${actName}" etkinliğini silmek istiyor musunuz?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('activities').delete().eq('grade', grade).eq('activity_name', actName);
                    await supabaseClient.from('activities').delete().eq('grade', grade).ilike('activity_name', actName + ' -%');
                }
                await loadAllDataFromSupabase();
                updateDelActivitiesAndReports();
                closeModal();
                alert('Etkinlik buluttan silindi!');
            }
        } else if (type === 'report') {
            const gradeVal = document.getElementById('del-grade').value;
            const unitName = document.getElementById('del-unit-select').value;
            const secName = document.getElementById('del-section-select').value;
            if (!unitName || !secName) { alert('Lütfen ünite ve bölüm seçin.'); return; }
            if (confirm(`Bu bölüme ait resmi rapor şablonunu silmek istiyor musunuz?`)) {
                if (supabaseClient) {
                    await supabaseClient.from('report_templates').delete().eq('grade', gradeVal).eq('unit_name', unitName).eq('section_name', secName);
                }
                await loadAllDataFromSupabase();
                updateDelActivitiesAndReports();
                closeModal();
                alert('Rapor şablonu buluttan silindi!');
            }
        }
    });

    updateDelUnits('6');
    toggleDelFields();
}

function updateDelUnits(grade) {
    const unitSel = document.getElementById('del-unit-select');
    if (!unitSel) return;
    unitSel.innerHTML = '<option value="">-- Ünite Seçin --</option>';
    (fenData[grade]?.units || []).forEach(u => {
        unitSel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
    updateDelSections('');
}

function updateDelSections(unitName) {
    const grade = document.getElementById('del-grade').value;
    const secSel = document.getElementById('del-section-select');
    if (!secSel) return;
    secSel.innerHTML = '<option value="">-- Bölüm Seçin --</option>';
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
        actSel.innerHTML = '<option value="">-- Etkinlik Seçin --</option>';
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

    const repSel = document.getElementById('del-report-select');
    if (repSel) {
        repSel.innerHTML = '<option value="">-- Rapor Şablonu Bulunuyor --</option>';
        if (unitName && secName) {
            repSel.innerHTML = `<option value="${unitName}|||${secName}">${unitName} / ${secName} (Raporu)</option>`;
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
        const cleanBranchCode = bName.split('/')[1] || bName;
        branchCards += `
            <div class="grade-card" style="border-top-color: #3b82f6; position: relative;">
                <div onclick="openGradeManagementBranchDetail('${grade}', '${bName}')" style="cursor: pointer;">
                    <h3>${bName} Şubesi</h3>
                    <p>${studentCount} Öğrenci Kayıtlı</p>
                    <span class="card-action">Şubeye Git &rarr;</span>
                </div>
                <button onclick="event.stopPropagation(); deleteBranch('${grade}', '${bName}')" style="position: absolute; top: 10px; right: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;">Sil</button>
            </div>
        `;
    });

    detailPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand"><span class="brand-icon">📚</span><h1>${grade}. SINIFLAR ŞUBE YÖNETİMİ</h1></div>
            <div>
                <button onclick="renderTeacherPanelView(true)" class="logout-btn" style="background:#3b82f6; margin-right:8px;">Geri Dön</button>
                <button onclick="logout()" class="logout-btn">Çıkış Yap</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div style="margin-bottom: 25px;">
                <button onclick="addNewBranchModal('${grade}')" class="action-btn student-btn" style="width: auto; padding: 10px 20px;">+ Yeni Şube Ekle</button>
            </div>
            <h3>Şubeler</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-top: 15px;">
                ${branchCards || '<p style="color:#94a3b8;">Henüz şube eklenmemiş.</p>'}
            </div>
        </section>
    `;
}

function openGradeManagementBranchDetail(grade, branchName, push = true) {
    openBranchDetail(grade, branchName, 'students', push);
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
            <div class="header-brand"><span class="brand-icon">🏫</span><h1>${grade}. Sınıf - ${branchName} Yönetim Paneli</h1></div>
            <div>
                <button onclick="openGradeManagement('${grade}', true)" class="logout-btn" style="background:#3b82f6; margin-right:8px;">Şubelere Dön</button>
                <button onclick="logout()" class="logout-btn">Çıkış Yap</button>
            </div>
        </header>
        <section class="dashboard-content">
            <div class="branch-tabs-grid">
                <div class="branch-tab-card ${tab === 'students' ? 'active' : ''}" onclick="switchBranchTab(this, 'students', '${grade}', '${branchName}')"><div class="tab-icon">👥</div><h3>Sınıf Listesi & Artı/Eksi</h3></div>
                <div class="branch-tab-card ${tab === 'quizzes' ? 'active' : ''}" onclick="switchBranchTab(this, 'quizzes', '${grade}', '${branchName}')"><div class="tab-icon">📝</div><h3>Quiz Sonuçları</h3></div>
                <div class="branch-tab-card ${tab === 'activities' ? 'active' : ''}" onclick="switchBranchTab(this, 'activities', '${grade}', '${branchName}')"><div class="tab-icon">🧪</div><h3>Etkinlik Ölçekleri</h3></div>
                <div class="branch-tab-card ${tab === 'reports' ? 'active' : ''}" onclick="switchBranchTab(this, 'reports', '${grade}', '${branchName}')"><div class="tab-icon">📊</div><h3>Raporlar & Analiz</h3></div>
            </div>
            <div id="branch-tab-content" style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); padding: 25px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); margin-top: 25px;"></div>
        </section>
    `;
    
    const activeCard = document.querySelector(`.branch-tab-card:nth-child(${tab === 'students' ? 1 : tab === 'quizzes' ? 2 : tab === 'activities' ? 3 : 4})`);
    loadBranchTabContent(activeCard, tab, grade, branchName);
}

function switchBranchTab(cardElement, tabType, grade, branchName) {
    document.querySelectorAll('.branch-tab-card').forEach(c => c.classList.remove('active'));
    if (cardElement) cardElement.classList.add('active');
    
    // URL ve state güncellemesi (Tarayıcının adres ve geçmişinde ayrı sayfa gibi görünmesini sağlar)
    const state = { type: 'branch-detail', grade, branchName, tab: tabType };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    const cleanBranch = branchName.replace('/', '-');
    history.pushState(state, '', `#sube-${grade}-${cleanBranch}-${tabType}`);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadBranchTabContent(cardElement, tabType, grade, branchName);
}

function loadBranchTabContent(cardElement, tabType, grade, branchName) {
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
                <td><button onclick="updatePoint('${grade}', '${branchName}', ${idx}, 'plus', 1)" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">+</button> ${s.plus}</td>
                <td><button onclick="updatePoint('${grade}', '${branchName}', ${idx}, 'minus', 1)" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">-</button> ${s.minus}</td>
                <td><button onclick="deleteStudent('${grade}', '${branchName}', ${idx})" style="background:#64748b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Sil</button></td>
            </tr>`;
        });

        contentArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                <h3 style="color:#f8fafc;">Öğrenci Listesi ve Anlık Performans (${branchName})</h3>
                <div style="display:flex; gap:10px;">
                    <button onclick="openBulkStudentModal('${grade}', '${branchName}')" class="action-btn" style="width:auto; padding:8px 16px; background:#059669; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">📋 e-Okul Listesini Toplu Yapıştır</button>
                    <button onclick="addStudentModal('${grade}', '${branchName}')" class="action-btn student-btn" style="width:auto; padding:8px 16px; background:#2563eb; color:white; border:none; border-radius:8px; cursor:pointer;">+ Öğrenci Ekle</button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>No</th><th>Ad Soyad</th><th>Artı Puan</th><th>Eksi Puan</th><th>İşlem</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Öğrenci bulunmuyor.</td></tr>'}</tbody>
                </table>
            </div>
        `;
    } else if (tabType === 'quizzes') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc;">📝 Quiz Sonuçları ve Değerlendirme</h3>
            <p style="color: #94a3b8; margin-top: 5px;">Ünite ve bölüm seçerek öğrenci notlarını girin ve kaydedin.</p>
            <div style="display: flex; gap: 15px; margin-top: 20px; flex-wrap: wrap;">
                <select id="quiz-unit-sel" class="auth-input" style="flex:1; min-width:200px;" onchange="loadSectionsForQuiz(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="quiz-section-select" class="auth-input" style="flex:1; min-width:200px;" onchange="renderQuizTable('${grade}', '${branchName}')"><option value="">-- Önce Ünite Seçin --</option></select>
            </div>
            <div id="quiz-table-container" style="margin-top:20px;"></div>
        `;
    } else if (tabType === 'activities') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc;">🧪 Etkinlik & Toplu Ölçek Puanlama</h3>
            <p style="color: #94a3b8; margin-top: 5px;">Ünite, bölüm ve etkinlik seçin. Öğrencinin yanındaki kutuya puanı yazıp <b>Tümüne Uygula</b> diyerek tüm ölçekleri otomatik doldurun veya sağdan spesifik bir ölçek seçerek detaylı görün.</p>
            <div style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
                <select id="act-unit-sel" class="auth-input" style="flex:1; min-width:160px;" onchange="loadSectionsForActivity(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="activity-section-select" class="auth-input" style="flex:1; min-width:160px;" onchange="loadBaseActivitiesForSelection('${grade}', '${branchName}')"><option value="">-- Bölüm Seçin --</option></select>
                <select id="activity-name-select" class="auth-input" style="flex:1; min-width:160px;" onchange="loadSubScalesForSelection('${grade}', '${branchName}')"><option value="">-- Etkinlik Seçin --</option></select>
                <select id="sub-scale-select" class="auth-input" style="flex:1; min-width:180px;" onchange="renderGroupedActivityTable('${grade}', '${branchName}')"><option value="-- TÜM ÖLÇEKLER --">-- Tüm Ölçekler (Genel Görünüm) --</option></select>
            </div>
            <div id="activity-table-container" style="margin-top:20px;"></div>
        `;
    } else if (tabType === 'reports') {
        contentArea.innerHTML = `
            <h3 style="color:#f8fafc;">📊 Şube Raporları, Toplu Sınıf Karnesi ve Bireysel Karne Görüntüleme</h3>
            <p style="color: #94a3b8; margin-top: 5px;">Ünite ve bölüm seçerek sınıf özetini görün veya öğrencilerin yanındaki butonla bireysel karnelerine ulaşın.</p>
            <div style="display: flex; gap: 15px; margin-top: 20px; flex-wrap: wrap; max-width: 600px;">
                <select id="rep-unit-sel" class="auth-input" style="flex:1;" onchange="loadSectionsForReport(this.value, '${grade}', '${branchName}')">${unitOptions}</select>
                <select id="report-section-select" class="auth-input" style="flex:1;" onchange="renderReportData('${grade}', '${branchName}')"><option value="">-- Bölüm Seçin --</option></select>
            </div>
            <div id="report-result-container" style="margin-top:20px;"></div>
        `;
    }
}

function openBulkStudentModal(grade, branchName) {
    const content = `
        <p style="color:#cbd5e1; font-size:13px; margin-bottom:10px;">
            ℹ️ e-Okul veya Excel'deki öğrenci listesini (Okul No ve Ad Soyad sütunlarını) kopyalayıp aşağıdaki kutuya doğrudan yapıştırın:
        </p>
        <textarea id="bulk-student-text" class="auth-input" style="height:200px; font-family:monospace; font-size:12px;" placeholder="2\tMUHAMMED HALİL İBRAHİM VARLI\n29\tİREM DİNÇ..."></textarea>
    `;

    openModal(`Toplu Öğrenci Aktar (${branchName})`, content, async () => {
        const rawText = document.getElementById('bulk-student-text').value.trim();
        if (!rawText) {
            alert('Lütfen e-Okul listesini yapıştırın!');
            return;
        }

        const lines = rawText.split('\n');
        let addedCount = 0;

        for (let line of lines) {
            let parts = line.split('\t');
            if (parts.length < 2) {
                parts = line.trim().split(/\s{2,}/);
            }

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
                            plus: 0,
                            minus: 0,
                            quiz: {},
                            scale: {}
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

        alert(`Toplam ${addedCount} öğrenci başarıyla eklendi ve numaraya göre sıralandı!`);
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
        container.innerHTML = '<p style="color:#94a3b8;">Lütfen ünite ve bölüm seçin.</p>';
        return;
    }

    const students = fenData[grade]?.branches[branchName] || [];
    let rows = '';
    students.forEach((s, idx) => {
        const key = `${unitName}_${secName}`;
        const currentScore = s.quiz?.[key] ?? '';
        
        rows += `<tr>
            <td style="position: sticky; left: 0; background: #1e293b; z-index: 2; width: 60px; text-align: center; border-right: 1px solid rgba(255,255,255,0.1);">${s.no}</td>
            <td style="position: sticky; left: 60px; background: #1e293b; z-index: 2; min-width: 180px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: 2px solid rgba(255,255,255,0.2); font-weight: 600;">${s.name}</td>
            <td style="min-width: 140px;"><input type="number" id="quiz-score-${idx}" class="auth-input" style="padding: 6px; width: 100px; box-sizing: border-box;" value="${currentScore}" placeholder="Not gir" onwheel="this.blur()"></td>
        </tr>`;
    });

    container.innerHTML = `
        <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">
            <div style="min-width: 650px;">
                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="position: sticky; left: 0; background: #0f172a; z-index: 3; width: 60px; border-right: 1px solid rgba(255,255,255,0.1);">No</th>
                            <th style="position: sticky; left: 60px; background: #0f172a; z-index: 3; min-width: 180px; border-right: 2px solid rgba(255,255,255,0.2);">Ad Soyad</th>
                            <th style="min-width: 140px;">Quiz Notu</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Öğrenci yok.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <button onclick="saveQuizScores('${grade}', '${branchName}')" class="auth-btn" style="width:auto; padding:10px 20px; margin-top:15px;">Quiz Notlarını Kaydet</button>
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
    alert('Quiz notları buluta başarıyla kaydedildi!');
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

    subScaleSel.innerHTML = '<option value="-- TÜM ÖLÇEKLER --">-- Tüm Ölçekler (Genel Görünüm) --</option>';
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
        container.innerHTML = '<p style="color:#94a3b8;">Lütfen bir etkinlik seçin.</p>';
        return;
    }

    const allActs = fenData[grade].activities || [];
    const subScales = allActs.filter(a => a.unit === unitName && a.section === secName && (a.name === baseActName || a.name.startsWith(baseActName + ' -')));

    if (subScales.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;">Bu etkinlik için kayıtlı ölçek bulunamadı.</p>';
        return;
    }

    if (selectedScaleName && selectedScaleName !== '-- TÜM ÖLÇEKLER --') {
        const scaleObj = subScales.find(a => a.name === selectedScaleName);
        if (!scaleObj) return;

        const criteria = scaleObj.criteria || ['1. Kriter', '2. Kriter', '3. Kriter', '4. Kriter'];
        const scaleType = scaleObj.scale_type || '1-4';
        const students = fenData[grade]?.branches[branchName] || [];

        let headerTh = '<th style="position: sticky; left: 0; background: #0f172a; z-index: 3; width: 60px; border-right: 1px solid rgba(255,255,255,0.1);">No</th><th style="position: sticky; left: 60px; background: #0f172a; z-index: 3; min-width: 180px; border-right: 2px solid rgba(255,255,255,0.2);">Ad Soyad</th>';
        criteria.forEach(c => { headerTh += `<th>${c}</th>`; });
        headerTh += '<th>Başarı (%)</th>';

        let rows = '';
        students.forEach((s) => {
            let cols = `<td style="position: sticky; left: 0; background: #1e293b; z-index: 2; width: 60px; text-align: center; border-right: 1px solid rgba(255,255,255,0.1);">${s.no}</td><td style="position: sticky; left: 60px; background: #1e293b; z-index: 2; min-width: 180px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: 2px solid rgba(255,255,255,0.2); font-weight: 600;">${s.name}</td>`;
            let storedScale = s.scale?.[selectedScaleName];
            
            if (!storedScale || storedScale['totalScore'] === undefined) {
                criteria.forEach(() => {
                    cols += `<td><span style="color:#94a3b8; font-size:12px;">-</span></td>`;
                });
                cols += `<td><b style="color:#94a3b8;">%-%</b></td>`;
            } else {
                let totalScore = 0;
                let maxScore = criteria.length * (scaleType === '1-4' ? 4 : 1);

                criteria.forEach((c, cIdx) => {
                    let val = storedScale[cIdx] !== undefined ? storedScale[cIdx] : (scaleType === '1-4' ? 4 : 1);
                    if (scaleType === '1-4') totalScore += parseInt(val) || 0;
                    else totalScore += val ? 1 : 0;

                    let textLabel = val;
                    if (scaleType === '1-4') {
                        if (val == 4) textLabel = '4 - Çok İyi';
                        else if (val == 3) textLabel = '3 - İyi';
                        else if (val == 2) textLabel = '2 - Geliş.';
                        else if (val == 1) textLabel = '1 - Yetersiz';
                    } else if (scaleType === 'var-yok') {
                        textLabel = val == 1 ? 'Var' : 'Yok';
                    } else {
                        textLabel = val == 1 ? 'Evet' : 'Hayır';
                    }

                    cols += `<td><span style="color:#38bdf8; font-weight:600; font-size:12px;">${textLabel}</span></td>`;
                });

                let percentage = storedScale['totalScore'];
                cols += `<td><b style="color:#34d399;">%${percentage}</b></td>`;
            }
            rows += `<tr>${cols}</tr>`;
        });

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <div style="font-size:12px; color:#cbd5e1; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                    ℹ️ <b>Detaylı Ölçek Görünümü:</b> Girdiğiniz etkinlik puanına göre otomatik puanlanmış kriterler listelenmektedir.
                </div>
                <button onclick="executeDirectWordDownload('singleScale', {grade: '${grade}', branchName: '${branchName}', unitName: '${unitName || ''}', secName: '${secName || ''}', scaleName: '${selectedScaleName.replace(/'/g, "\\\\'")}'})" class="action-btn" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">📝 Word İndir</button>
            </div>
            <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">
                <div style="min-width: 800px;">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead><tr>${headerTh}</tr></thead>
                        <tbody>${rows || '<tr><td colspan="10" style="text-align:center; color:#94a3b8;">Öğrenci bulunamadı.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        `;
        return;
    }

    const students = fenData[grade]?.branches[branchName] || [];

    let headerTh = '<th style="position: sticky; left: 0; background: #0f172a; z-index: 3; width: 60px; border-right: 1px solid rgba(255,255,255,0.1);">No</th><th style="position: sticky; left: 60px; background: #0f172a; z-index: 3; min-width: 180px; border-right: 2px solid rgba(255,255,255,0.2);">Ad Soyad</th><th>⚡ Toplu Etkinlik Puanı (0-100)</th>';
    subScales.forEach(scale => {
        let shortName = scale.name.replace(baseActName, '').replace(/^[\s-]+/, '');
        if (!shortName) shortName = scale.name;
        headerTh += `<th>${shortName} (% Ort.)</th>`;
    });

    let rows = '';
    students.forEach((s, sIdx) => {
        let cols = `<td style="position: sticky; left: 0; background: #1e293b; z-index: 2; width: 60px; text-align: center; border-right: 1px solid rgba(255,255,255,0.1);">${s.no}</td><td style="position: sticky; left: 60px; background: #1e293b; z-index: 2; min-width: 180px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-right: 2px solid rgba(255,255,255,0.2); font-weight: 600;">${s.name}</td>`;
        
        cols += `<td>
            <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" id="group-quick-input-${sIdx}" class="auth-input" style="padding:4px; width:70px; font-size:12px; text-align:center;" min="0" max="100" placeholder="Örn: 85" onwheel="this.blur()">
                <button onclick="applyScoreToAllSubScales(${sIdx}, '${baseActName.replace(/'/g, "\\\\'")}', ${subScales.length})" style="background:#0284c7; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-weight:600;" title="Tüm Ölçeklere Uygula">Tümüne Uygula</button>
            </div>
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
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
            <div style="font-size:12px; color:#cbd5e1; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px;">
                ℹ️ <b>Toplu Otomasyon:</b> Ortak puanı yazıp <b>Tümüne Uygula</b> diyerek bu etkinliğe ait tüm ölçekleri otomatik doldurabilir veya sağdaki menüden tek bir ölçeğin detayına inebilirsin!
            </div>
            <button onclick="executeDirectWordDownload('groupActivity', {grade: '${grade}', branchName: '${branchName}', unitName: '${unitName || ''}', secName: '${secName || ''}', baseActName: '${baseActName.replace(/'/g, "\\\\'")}'})" class="action-btn" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">📝 Word İndir</button>
        </div>
        <div class="table-responsive" style="overflow-x: auto; max-width: 100%;">
            <div style="min-width: 850px;">
                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                    <thead><tr>${headerTh}</tr></thead>
                    <tbody>${rows || '<tr><td colspan="10" style="text-align:center; color:#94a3b8;">Öğrenci bulunamadı.</td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <button onclick="saveGroupScaleScores('${grade}', '${branchName}', '${baseActName.replace(/'/g, "\\\\'")}')" class="auth-btn" style="width:auto; padding:10px 20px; margin-top:15px;">Tüm Ölçek Puanlarını Kaydet</button>
    `;
}

function applyScoreToAllSubScales(sIdx, baseActName, subScalesCount) {
    const inputEl = document.getElementById(`group-quick-input-${sIdx}`);
    if (!inputEl) return;
    const targetVal = parseFloat(inputEl.value);
    if (isNaN(targetVal) || targetVal < 0 || targetVal > 100) {
        alert('Lütfen 0 ile 100 arasında geçerli bir puan girin!');
        return;
    }

    for (let scaleIdx = 0; scaleIdx < subScalesCount; scaleIdx++) {
        const badgeEl = document.getElementById(`scale-badge-${sIdx}-${scaleIdx}`);
        if (badgeEl) {
            badgeEl.innerText = `%${Math.round(targetVal)}`;
            badgeEl.style.color = '#38bdf8';
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
    alert('Etkinliğe ait tüm ölçek puanları başarıyla kaydedildi!');
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
        container.innerHTML = '<p style="color:#94a3b8;">Rapor oluşturmak için lütfen ünite ve bölüm seçin.</p>';
        return;
    }

    let customReportText = "";
    if (supabaseClient) {
        const { data: repData, error } = await supabaseClient
            .from('report_templates')
            .select('report_text')
            .eq('grade', grade)
            .eq('unit_name', unitName)
            .eq('section_name', secName)
            .single();

        if (repData && repData.report_text) {
            customReportText = repData.report_text;
        }
    }

    const students = fenData[grade]?.branches[branchName] || [];
    const activitiesInSec = (fenData[grade]?.activities || []).filter(a => a.unit === unitName && a.section === secName);

    let rows = '';
    let totalQuiz = 0, quizCount = 0, totalScaleAvgSum = 0, scaleStudentCount = 0;
    let quizHigh = 0, quizMid = 0, quizLow = 0, quizEvaluatedTotal = 0;

    students.forEach((s) => {
        const key = `${unitName}_${secName}`;
        let rawQuiz = s.quiz?.[key];
        const qScore = (rawQuiz !== undefined && rawQuiz !== '' && !isNaN(rawQuiz)) ? parseFloat(rawQuiz) : null;
        
        if (qScore !== null) { 
            totalQuiz += qScore; 
            quizCount++;
            quizEvaluatedTotal++;
            if (qScore >= 70) quizHigh++;
            else if (qScore >= 45) quizMid++;
            else quizLow++;
        }

        let studentScaleScores = [];
        activitiesInSec.forEach(act => {
            if (s.scale && s.scale[act.name]) {
                let sc = s.scale[act.name]['totalScore'];
                if (sc !== undefined && sc !== '') studentScaleScores.push(parseFloat(sc));
            }
        });

        let activitySummary = 'Değerlendirilmedi';
        let avgScore = null;
        if (studentScaleScores.length > 0) {
            avgScore = Math.round(studentScaleScores.reduce((a, b) => a + b, 0) / studentScaleScores.length);
            activitySummary = `${avgScore}% (Ortalama)`;
            totalScaleAvgSum += avgScore;
            scaleStudentCount++;
        }

        rows += `<tr>
            <td>${s.no}</td>
            <td>${s.name}</td>
            <td><b>${qScore !== null ? qScore + ' Puan' : 'Not Girilmemiş'}</b></td>
            <td>${activitySummary}</td>
            <td><button onclick="executeDirectWordDownload('studentReport', {grade: '${grade}', branchName: '${branchName}', schoolNo: '${s.no}', unitName: '${unitName}', secName: '${secName}'})" style="background:#2563eb; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600;">📝 Word İndir</button></td>
        </tr>`;
    });

    const classAverage = quizCount > 0 ? (totalQuiz / quizCount).toFixed(1) : 'Hesaplanmadı';
    const classScaleAverage = scaleStudentCount > 0 ? Math.round(totalScaleAvgSum / scaleStudentCount) : 'Hesaplanmadı';
    const getPercent = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

    const baseReport = customReportText ? customReportText : `${grade}. SINIF FEN BİLİMLERİ DERSİ
ÜNİTE DEĞERLENDİRME VE SINIF KARNESİ RAPORU

Ünite Adı: ${unitName}
Bölüm / Konu: ${secName}
Şube: ${grade}/${branchName}
Toplam Öğrenci Mevcudu: ${students.length}`;

    const narrativeText = `${baseReport}

--------------------------------------------------
ŞUBE İSTATİSTİKSEL BAŞARI ANALİZİ (${grade}. Sınıf - ${branchName})
- Sınıf Quiz Ortalama Puanı: ${classAverage !== 'Hesaplanmadı' ? classAverage + ' / 100' : 'Hesaplanmadı'}
- Etkinlik ve Uygulama Başarı Ortalaması: ${classScaleAverage !== 'Hesaplanmadı' ? '%' + classScaleAverage : 'Hesaplanmadı'}

A) Quiz Değerlendirme Dağılımı (Katılan: ${quizEvaluatedTotal} Öğrenci):
- 70 ve Üstü (Başarılı): ${quizHigh} öğrenci (%${getPercent(quizHigh, quizEvaluatedTotal)})
- 45 - 69 Arası (Orta / Geliştirilebilir): ${quizMid} öğrenci (%${getPercent(quizMid, quizEvaluatedTotal)})
- 45 Altı (Destek İhtiyacı Olan): ${quizLow} öğrenci (%${getPercent(quizLow, quizEvaluatedTotal)})`;

    container.innerHTML = `
        <div style="background:rgba(15,23,42,0.85); padding:20px; border-radius:14px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 10px 25px rgba(0,0,0,0.3);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.08); flex-wrap:wrap; gap:15px;">
                <div>
                    <h4 style="color:#f8fafc; margin-bottom:4px;">📊 Toplu Sınıf Karnesi ve Resmi Rapor (${grade}. Sınıf - ${branchName})</h4>
                    <p style="color:#94a3b8; font-size:13px; margin:0;">Genel sınıf istatistikleri ve toplu rapor metni</p>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button onclick="executeDirectWordDownload('classReport', {grade: '${grade}', branchName: '${branchName}', unitName: '${unitName}', secName: '${secName}'})" class="action-btn student-btn" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">📝 Sınıf Raporunu Word İndir</button>
                    <button onclick="copyNarrativeReport()" class="action-btn student-btn" style="background:#3b82f6; color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">📋 Toplu Raporu Kopyala</button>
                </div>
            </div>

            <div style="display:flex; gap:25px; flex-wrap:wrap; margin-bottom:15px;">
                <div><b>Toplam Mevcut:</b> <span style="color:#f8fafc; font-size:18px;">${students.length}</span></div>
                <div><b>Sınıf Quiz Ort.:</b> <span style="color:#60a5fa; font-size:18px;">${classAverage !== 'Hesaplanmadı' ? classAverage + ' Puan' : 'Hesaplanmadı'}</span></div>
                <div><b>Sınıf Ölçek Ort.:</b> <span style="color:#34d399; font-size:18px;">${classScaleAverage !== 'Hesaplanmadı' ? '%' + classScaleAverage : 'Hesaplanmadı'}</span></div>
            </div>

            <div style="background:rgba(15,23,42,0.95); padding:15px; border-radius:10px; border:1px solid rgba(255,255,255,0.15);">
                <h5 style="color:#f8fafc; margin-bottom:8px; font-size:14px;">📄 Toplu Sınıf Karnesi Rapor Metni</h5>
                <textarea id="narrative-report-box" style="width:100%; height:200px; background:#0f172a; color:#e2e8f0; border:1px solid #334155; border-radius:6px; padding:10px; font-family:monospace; font-size:12px; resize:vertical;" readonly>${narrativeText}</textarea>
            </div>
        </div>

        <h4 style="margin-bottom:10px; color:#f8fafc;">Öğrenci Listesi ve Bireysel Karne Erişimleri: ${unitName} / ${secName}</h4>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>No</th><th>Ad Soyad</th><th>Quiz Notu</th><th>Etkinlik Sonucu</th><th>Bireysel Karne</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Öğrenci bulunmuyor.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

function copyNarrativeReport() {
    const box = document.getElementById('narrative-report-box');
    if (!box) return;
    box.select();
    box.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(box.value).then(() => {
        alert('Toplu sınıf karnesi başarıyla panoya kopyalandı!');
    }).catch(err => {
        alert('Kopyalama başarısız oldu: ' + err);
    });
}

function addStudentModal(grade, branchName) {
    const content = `
        <label style="color:#cbd5e1;">Okul No:</label><input type="number" id="s-no" class="auth-input" style="margin-bottom:10px;">
        <label style="color:#cbd5e1;">Ad Soyad:</label><input type="text" id="s-name" class="auth-input">
    `;
    openModal("Öğrenci Ekle", content, async () => {
        const noInput = document.getElementById('s-no').value.trim();
        const name = document.getElementById('s-name').value.trim().toUpperCase();
        
        if (!noInput || !name) {
            alert('Lütfen okul no ve ad soyad girin.');
            return;
        }

        const no = parseInt(noInput);

        if (supabaseClient) {
            const { error } = await supabaseClient.from('students').insert([{
                grade: grade,
                branch: branchName,
                school_no: no,
                name: name,
                plus: 0,
                minus: 0,
                quiz: {},
                scale: {}
            }]);

            if (error) {
                alert('Öğrenci eklenirken hata oluştu: ' + error.message);
                return;
            }
        }

        await loadAllDataFromSupabase();
        
        if (fenData[grade]?.branches[branchName]) {
            fenData[grade].branches[branchName].sort((a, b) => parseInt(a.no) - parseInt(b.no));
        }

        alert('Öğrenci buluta başarıyla kaydedildi ve sıralandı!');
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
        await supabaseClient.from('students').update({
            plus: student.plus,
            minus: student.minus
        }).eq('grade', grade).eq('branch', branchName).eq('school_no', student.no);
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
        if (localStudent) {
            foundStudent = localStudent;
        }
    }

    if (!foundStudent && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('students')
                .select('*')
                .eq('grade', grade)
                .eq('branch', branch)
                .eq('school_no', schoolNo)
                .single();

            if (data && data.name.trim().toUpperCase() === nameInput) {
                foundStudent = {
                    no: data.school_no,
                    name: data.name,
                    plus: data.plus || 0,
                    minus: data.minus || 0,
                    quiz: data.quiz || {},
                    scale: data.scale || {}
                };
            }
        } catch (e) {
            console.log('Supabase student check info:', e);
        }
    }

    if (!foundStudent) {
        alert('Giriş Başarısız: Bu sınıf ve şubede belirttiğiniz okul numarası ve ad soyad ile kayıtlı bir öğrenci bulunamadı.');
        return;
    }

    renderStudentPanelView(grade, branch, foundStudent, push);
}

function renderStudentPanelView(grade, branch, student, push = true) {
    const state = { type: 'student', grade, branch, student };
    sessionStorage.setItem('fen_app_state', JSON.stringify(state));
    if (push) {
        history.pushState(state, '', '#ogrenci-paneli');
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('teacher-panel').style.display = 'none';
    document.getElementById('grade-detail-panel').style.display = 'none';
    const studentPanel = document.getElementById('student-panel');
    if (!studentPanel) return;
    studentPanel.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeModal();

    const branchStudents = fenData[grade]?.branches[branch] || [];

    let badgesHtml = '';
    if (student.plus >= 5) badgesHtml += '<span style="background:rgba(59,130,246,0.2); border:1px solid #3b82f6; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; color:#60a5fa;">🚀 Uzay Kaşifi</span>';
    if (student.quiz) {
        let qVals = Object.values(student.quiz).filter(v => v !== '' && v !== undefined && !isNaN(v)).map(Number);
        let qAvg = qVals.length > 0 ? qVals.reduce((a,b)=>a+b,0)/qVals.length : 0;
        if (qAvg >= 85) badgesHtml += '<span style="background:rgba(16,185,129,0.2); border:1px solid #10b981; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; color:#34d399;">⚛️ Atom Uzmanı</span>';
    }
    if (student.scale && Object.keys(student.scale).length > 0) {
        badgesHtml += '<span style="background:rgba(139,92,246,0.2); border:1px solid #8b5cf6; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; color:#a78bfa;">🧬 Bilim İnsanı</span>';
    }
    if (!badgesHtml) badgesHtml = '<span style="color:#94a3b8; font-size:13px;">Henüz rozet kazanılmadı. Çalışmaya devam! 🌟</span>';

    let quizRows = '';
    if (student.quiz) {
        const sortedQuizKeys = Object.keys(student.quiz).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

        sortedQuizKeys.forEach(qKey => {
            let score = student.quiz[qKey];
            if (score !== '' && score !== undefined) {
                let quizTotal = 0;
                let quizCount = 0;
                branchStudents.forEach(bs => {
                    let bsVal = bs.quiz?.[qKey];
                    if (bsVal !== undefined && bsVal !== '' && !isNaN(bsVal)) {
                        quizTotal += parseFloat(bsVal);
                        quizCount++;
                    }
                });
                let quizClassAvg = quizCount > 0 ? (quizTotal / quizCount).toFixed(1) + ' Puan' : 'Hesaplanmadı';

                quizRows += `<tr>
                    <td><span style="margin-right:8px;">⚛️</span>${qKey.replace('_', ' / ')}</td>
                    <td><b style="color:#60a5fa; font-size:15px;">${score} Puan</b></td>
                    <td><span style="color:#94a3b8; font-size:14px; font-weight:600;">${quizClassAvg}</span></td>
                </tr>`;
            }
        });
    }

    let scaleRows = '';
    if (student.scale) {
        let activityGroups = {};
        
        Object.keys(student.scale).forEach(fullActName => {
            let sc = student.scale[fullActName]['totalScore'];
            if (sc !== undefined && sc !== '') {
                let parts = fullActName.split(' - ');
                let baseName = fullActName;
                if (parts.length > 1) {
                    parts.pop();
                    baseName = parts.join(' - ');
                }
                if (!activityGroups[baseName]) {
                    activityGroups[baseName] = [];
                }
                activityGroups[baseName].push(sc);
            }
        });

        const sortedBaseNames = Object.keys(activityGroups).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

        sortedBaseNames.forEach(baseName => {
            let scores = activityGroups[baseName];
            let studentAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

            let classTotal = 0;
            let classCount = 0;
            branchStudents.forEach(bs => {
                if (bs.scale) {
                    let bsScores = [];
                    Object.keys(bs.scale).forEach(bsFullAct => {
                        if (bsFullAct.startsWith(baseName)) {
                            let bsSc = bs.scale[bsFullAct]['totalScore'];
                            if (bsSc !== undefined && bsSc !== '') bsScores.push(parseFloat(bsSc));
                        }
                    });
                    if (bsScores.length > 0) {
                        let bsAvg = bsScores.reduce((a, b) => a + b, 0) / bsScores.length;
                        classTotal += bsAvg;
                        classCount++;
                    }
                }
            });
            let classAvgStr = classCount > 0 ? Math.round(classTotal / classCount) + '%' : 'Hesaplanmadı';

            scaleRows += `<tr>
                <td><span style="margin-right:8px;">🧬</span>${baseName}</td>
                <td><b style="color:#34d399; font-size:15px;">${studentAvg}%</b></td>
                <td><span style="color:#94a3b8; font-size:14px; font-weight:600;">${classAvgStr}</span></td>
            </tr>`;
        });
    }

    studentPanel.innerHTML = `
        <header class="teacher-header">
            <div class="header-brand">
                <span class="floating-rocket" style="font-size: 28px;">🚀</span>
                <h1>Öğrenci Bilgi Paneli - ${student.name} (${branch})</h1>
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="executeDirectWordDownload('studentReport', {grade: '${grade}', branchName: '${branch}', schoolNo: '${student.no}', unitName: 'Genel', secName: 'Genel Değerlendirme'})" class="logout-btn" style="background:#2563eb;">📝 Word İndir</button>
                <button onclick="logoutStudent()" class="logout-btn">Çıkış Yap</button>
            </div>
        </header>

        <section class="dashboard-content" style="position:relative;">
            <div style="background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); padding: 24px; border-radius: 20px; margin-bottom: 25px; display: flex; gap: 40px; flex-wrap: wrap; box-shadow: 0 15px 35px rgba(0,0,0,0.4); position:relative; z-index:1;">
                <div><span style="color:#94a3b8; display:block; font-size:12px; font-weight:600;">OKUL NO</span><span style="color:#f8fafc; font-size:18px; font-weight:700;">${student.no}</span></div>
                <div><span style="color:#94a3b8; display:block; font-size:12px; font-weight:600;">SINIF / ŞUBE</span><span style="color:#f8fafc; font-size:18px; font-weight:700;">${grade}. Sınıf - ${branch}</span></div>
                <div><span style="color:#94a3b8; display:block; font-size:12px; font-weight:600;">ARTI / EKSİ</span><span style="color:#fbbf24; font-size:18px; font-weight:700;">+${student.plus} / -${student.minus}</span></div>
            </div>

            <div style="background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.15); padding: 20px; border-radius: 20px; margin-bottom: 25px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                <b style="color:#f8fafc; font-size:14px; margin-right:5px;">🏆 Motivasyon Rozetlerim:</b>
                ${badgesHtml}
            </div>

            <h3 style="margin-bottom:15px; color:#f8fafc; font-size:18px;">📝 Quiz Sonuçlarım</h3>
            <div class="table-responsive" style="margin-bottom:35px;">
                <table class="data-table">
                    <thead><tr><th>Ünite / Bölüm</th><th>Quiz Notum</th><th>Sınıf Ort.</th></tr></thead>
                    <tbody>${quizRows || '<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding:20px;">Henüz girilmiş quiz sonucunuz bulunmuyor. 🚀</td></tr>'}</tbody>
                </table>
            </div>

            <h3 style="margin-bottom:15px; color:#f8fafc; font-size:18px;">🧪 Etkinlik Ölçek Sonuçlarım (Etkinlik Ortalama)</h3>
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>Etkinlik Adı</th><th>Başarı Puanım (Ort.)</th><th>Sınıf Ort.</th></tr></thead>
                    <tbody>${scaleRows || '<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding:20px;">Henüz değerlendirilmiş etkinlik ölçeğiniz bulunmuyor. 🧬</td></tr>'}</tbody>
                </table>
            </div>
        </section>
    `;
}

async function executeDirectWordDownload(type, config) {
    let htmlString = "";
    let fileName = "Rapor";
    const { grade, branchName, unitName, secName, scaleName, baseActName, schoolNo } = config;

    if (type === 'singleScale') {
        htmlString = generateSingleScaleHTML(grade, branchName, unitName, secName, scaleName);
        fileName = `Tekil_Olcek_${scaleName.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/gi, '_')}`;
    } else if (type === 'groupActivity') {
        htmlString = generateGroupActivityHTML(grade, branchName, unitName, secName, baseActName);
        fileName = `Toplu_Etkinlik_${baseActName.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/gi, '_')}`;
    } else if (type === 'classReport') {
        htmlString = generateClassReportHTML(grade, branchName, unitName, secName);
        fileName = `Sinif_Raporu_${grade}_${branchName.replace('/', '_')}`;
    } else if (type === 'studentReport') {
        htmlString = generateStudentReportHTML(grade, branchName, schoolNo, unitName, secName);
        const studentName = fenData[grade]?.branches[branchName]?.find(s => parseInt(s.no) === parseInt(schoolNo))?.name || schoolNo;
        fileName = `Ogrenci_Karnesi_${studentName.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/gi, '_')}`;
    }

    try {
        if (typeof htmlDocx === 'undefined') {
            alert("Word dışa aktarım kütüphanesi (htmlDocx) eksik.");
            return;
        }
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title></head><body>${htmlString}</body></html>`;
        const converted = htmlDocx.asBlob(fullHtml);
        saveAs(converted, fileName + '.docx');
    } catch (err) {
        console.error("Word indirme hatası:", err);
        alert("Word dosyası indirilirken bir hata oluştu.");
    }
}

function generateSingleScaleHTML(grade, branchName, unitName, secName, scaleName) {
    const allActs = fenData[grade].activities || [];
    const scaleObj = allActs.find(a => a.name === scaleName);
    const criteria = scaleObj?.criteria || ['1. Kriter', '2. Kriter', '3. Kriter', '4. Kriter'];
    const scaleType = scaleObj?.scale_type || '1-4';
    const students = fenData[grade]?.branches[branchName] || [];

    let headerTh = '<th style="border:1px solid #94a3b8; padding:6px; text-align:left;">No</th><th style="border:1px solid #94a3b8; padding:6px; text-align:left;">Ad Soyad</th>';
    criteria.forEach(c => { headerTh += `<th style="border:1px solid #94a3b8; padding:6px; text-align:left;">${c}</th>`; });
    headerTh += '<th style="border:1px solid #94a3b8; padding:6px; text-align:left;">Başarı (%)</th>';

    let rows = '';
    students.forEach((s) => {
        let cols = `<td style="border:1px solid #94a3b8; padding:6px;">${s.no}</td><td style="border:1px solid #94a3b8; padding:6px;">${s.name}</td>`;
        let storedScale = s.scale?.[scaleName];

        if (!storedScale || storedScale['totalScore'] === undefined) {
            criteria.forEach(() => { cols += `<td style="border:1px solid #94a3b8; padding:6px; color:#888;">-</td>`; });
            cols += `<td style="border:1px solid #94a3b8; padding:6px;"><b>%-%</b></td>`;
        } else {
            criteria.forEach((c, cIdx) => {
                let val = storedScale[cIdx] !== undefined ? storedScale[cIdx] : (scaleType === '1-4' ? 4 : 1);
                let textLabel = val;
                if (scaleType === '1-4') {
                    if (val == 4) textLabel = '4 - Çok İyi'; else if (val == 3) textLabel = '3 - İyi'; else if (val == 2) textLabel = '2 - Geliş.'; else if (val == 1) textLabel = '1 - Yetersiz';
                } else if (scaleType === 'var-yok') textLabel = val == 1 ? 'Var' : 'Yok';
                else textLabel = val == 1 ? 'Evet' : 'Hayır';
                cols += `<td style="border:1px solid #94a3b8; padding:6px;">${textLabel}</td>`;
            });
            cols += `<td style="border:1px solid #94a3b8; padding:6px;"><b>%${storedScale['totalScore']}</b></td>`;
        }
        rows += `<tr>${cols}</tr>`;
    });

    return `
        <div style="background: white; color: black; font-family: 'Poppins', sans-serif; padding:15px;">
            <div style="text-align:center; margin-bottom:15px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h3 style="color:black; font-size:16px; margin-top:5px; font-weight:700;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL</h3>
                <p style="color:#333; font-size:11px; font-weight:600;">TEKİL ÖLÇEK DEĞERLENDİRME RAPORU</p>
            </div>
            <div style="margin-bottom:15px; font-size:12px; line-height:1.5; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">
                <p><b>Sınıf / Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
                <p><b>Ölçek Adı:</b> ${scaleName}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:10px; text-align:left;">
                <thead><tr style="background:#e2e8f0;">${headerTh}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function generateGroupActivityHTML(grade, branchName, unitName, secName, baseActName) {
    const allActs = fenData[grade].activities || [];
    const subScales = allActs.filter(a => a.unit === unitName && a.section === secName && (a.name === baseActName || a.name.startsWith(baseActName + ' -')));
    const students = fenData[grade]?.branches[branchName] || [];

    let headerTh = '<th style="border:1px solid #94a3b8; padding:6px; text-align:left;">No</th><th style="border:1px solid #94a3b8; padding:6px; text-align:left;">Ad Soyad</th>';
    subScales.forEach(scale => {
        let shortName = scale.name.replace(baseActName, '').replace(/^[\s-]+/, '');
        headerTh += `<th style="border:1px solid #94a3b8; padding:6px; text-align:left;">${shortName || scale.name}</th>`;
    });

    let rows = '';
    students.forEach((s) => {
        let cols = `<td style="border:1px solid #94a3b8; padding:6px;">${s.no}</td><td style="border:1px solid #94a3b8; padding:6px;">${s.name}</td>`;
        subScales.forEach(scale => {
            let hasScore = s.scale?.[scale.name] && s.scale[scale.name]['totalScore'] !== undefined && s.scale[scale.name]['totalScore'] !== '';
            let scVal = hasScore ? s.scale[scale.name]['totalScore'] : '-';
            cols += `<td style="border:1px solid #94a3b8; padding:6px;"><b>${scVal !== '-' ? '%' + scVal : '%-'}</b></td>`;
        });
        rows += `<tr>${cols}</tr>`;
    });

    return `
        <div style="background: white; color: black; font-family: 'Poppins', sans-serif; padding:15px;">
            <div style="text-align:center; margin-bottom:15px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h3 style="color:black; font-size:16px; margin-top:5px; font-weight:700;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL</h3>
                <p style="color:#333; font-size:11px; font-weight:600;">ETKİNLİK TOPLU ÖLÇEK RAPORU</p>
            </div>
            <div style="margin-bottom:15px; font-size:12px; line-height:1.5; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">
                <p><b>Sınıf / Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                <p><b>Ünite / Bölüm:</b> ${unitName} / ${secName}</p>
                <p><b>Etkinlik Adı:</b> ${baseActName}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:10px; text-align:left;">
                <thead><tr style="background:#e2e8f0;">${headerTh}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function generateClassReportHTML(grade, branchName, unitName, secName) {
    const students = fenData[grade]?.branches[branchName] || [];
    const activitiesInSec = (fenData[grade]?.activities || []).filter(a => a.unit === unitName && a.section === secName);
    const narrativeText = document.getElementById('narrative-report-box')?.value || '';

    let studentListRows = '';
    let totalQuiz = 0, quizCount = 0, totalScaleAvgSum = 0, scaleStudentCount = 0;

    students.forEach((s) => {
        const key = `${unitName}_${secName}`;
        let rawQuiz = s.quiz?.[key];
        const qScore = (rawQuiz !== undefined && rawQuiz !== '' && !isNaN(rawQuiz)) ? parseFloat(rawQuiz) : null;
        if (qScore !== null) { totalQuiz += qScore; quizCount++; }

        let studentScaleScores = [];
        activitiesInSec.forEach(act => {
            if (s.scale && s.scale[act.name]) {
                let sc = s.scale[act.name]['totalScore'];
                if (sc !== undefined && sc !== '') studentScaleScores.push(parseFloat(sc));
            }
        });
        
        let scaleAvgStr = 'Değerlendirilmedi';
        if (studentScaleScores.length > 0) {
            let avg = Math.round(studentScaleScores.reduce((a, b) => a + b, 0) / studentScaleScores.length);
            scaleAvgStr = `${avg}%`;
            totalScaleAvgSum += avg;
            scaleStudentCount++;
        }

        studentListRows += `<tr>
            <td style="border:1px solid #94a3b8; padding:6px;">${s.no}</td>
            <td style="border:1px solid #94a3b8; padding:6px;">${s.name}</td>
            <td style="border:1px solid #94a3b8; padding:6px;"><b>${qScore !== null ? qScore + ' Puan' : 'Girilmedi'}</b></td>
            <td style="border:1px solid #94a3b8; padding:6px;"><b>${scaleAvgStr}</b></td>
        </tr>`;
    });

    const classAverage = quizCount > 0 ? (totalQuiz / quizCount).toFixed(1) + ' Puan' : 'Hesaplanmadı';
    const classScaleAverage = scaleStudentCount > 0 ? Math.round(totalScaleAvgSum / scaleStudentCount) + '%' : 'Hesaplanmadı';

    return `
        <div style="background: white; color: black; font-family: 'Poppins', sans-serif; padding:15px;">
            <div style="text-align:center; margin-bottom:15px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h3 style="color:black; font-size:16px; margin-top:5px; font-weight:700;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL</h3>
                <p style="color:#333; font-size:11px; font-weight:600;">${grade}. SINIF (${branchName}) SINIF KARNESİ VE RAPORU</p>
                <p style="color:#555; font-size:10px; margin-top:3px;">Ünite: ${unitName} | Bölüm: ${secName}</p>
            </div>
            <div style="margin-bottom:15px; font-size:12px; line-height:1.5; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">
                <p><b>Toplam Mevcut:</b> ${students.length} | <b>Sınıf Quiz Ort.:</b> ${classAverage} | <b>Sınıf Ölçek Ort.:</b> ${classScaleAverage}</p>
            </div>
            <h4 style="font-size:13px; margin-bottom:5px; font-weight:700;">👥 Öğrenci Listesi</h4>
            <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left; margin-bottom:15px;">
                <thead>
                    <tr style="background:#e2e8f0; color:black;">
                        <th style="border:1px solid #94a3b8; padding:6px;">No</th>
                        <th style="border:1px solid #94a3b8; padding:6px;">Ad Soyad</th>
                        <th style="border:1px solid #94a3b8; padding:6px;">Quiz Sonucu</th>
                        <th style="border:1px solid #94a3b8; padding:6px;">Ölçek Ortalaması</th>
                    </tr>
                </thead>
                <tbody>${studentListRows}</tbody>
            </table>
            <div>
                <h4 style="font-size:13px; margin-bottom:5px; font-weight:700;">📄 Rapor Özeti</h4>
                <div style="width:100%; background:#f8fafc; border:1px solid #94a3b8; border-radius:6px; padding:10px; font-family:monospace; font-size:11px; white-space: pre-wrap;">${narrativeText}</div>
            </div>
        </div>
    `;
}

function generateStudentReportHTML(grade, branchName, schoolNo, unitName, secName) {
    const students = fenData[grade]?.branches[branchName] || [];
    const student = students.find(s => parseInt(s.no) === parseInt(schoolNo));
    if (!student) return "";
    const branchStudents = fenData[grade]?.branches[branchName] || [];

    let studentQuizHtml = '';
    if (student.quiz) {
        Object.keys(student.quiz).forEach(qKey => {
            let score = student.quiz[qKey];
            if (score !== '' && score !== undefined) {
                let quizTotal = 0, quizCount = 0;
                branchStudents.forEach(bs => {
                    let bsVal = bs.quiz?.[qKey];
                    if (bsVal !== undefined && bsVal !== '' && !isNaN(bsVal)) {
                        quizTotal += parseFloat(bsVal);
                        quizCount++;
                    }
                });
                let quizClassAvg = quizCount > 0 ? (quizTotal / quizCount).toFixed(1) + ' Puan' : 'Hesaplanmadı';
                studentQuizHtml += `<tr>
                    <td style="border:1px solid #94a3b8; padding:6px;">${qKey.replace('_', ' / ')}</td>
                    <td style="border:1px solid #94a3b8; padding:6px;"><b>${score} Puan</b></td>
                    <td style="border:1px solid #94a3b8; padding:6px; color:#555;">Sınıfta Ort: ${quizClassAvg}</td>
                </tr>`;
            }
        });
    }

    return `
        <div style="background: white; color: black; font-family: 'Poppins', sans-serif; padding:15px;">
            <div style="text-align:center; margin-bottom:15px; border-bottom:2px solid #333; padding-bottom:10px;">
                <h3 style="color:black; font-size:16px; margin-top:5px; font-weight:700;">ERDOĞAN YILMAZ FEN BİLİMLERİ DİJİTAL</h3>
                <p style="color:#333; font-size:11px; font-weight:600;">ÖĞRENCİ KARNESİ VE DEĞERLENDİRME RAPORU</p>
            </div>
            <div style="font-size:12px; line-height:1.5;">
                <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid #cbd5e1;">
                    <p><b>Öğrenci Adı Soyad:</b> ${student.name}</p>
                    <p><b>Okul Numarası:</b> ${student.no}</p>
                    <p><b>Sınıf ve Şube:</b> ${grade}. Sınıf - ${branchName}</p>
                    <p><b>Artı / Eksi Durumu:</b> +${student.plus} / -${student.minus}</p>
                </div>
                <div style="margin-top:10px; margin-bottom:15px;">
                    <b style="font-size:12px;">📝 Quiz Sonuçları:</b>
                    <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:5px; text-align:left;">
                        <thead>
                            <tr style="background:#e2e8f0;">
                                <th style="border:1px solid #94a3b8; padding:6px;">Ünite / Bölüm</th>
                                <th style="border:1px solid #94a3b8; padding:6px;">Quiz Notu</th>
                                <th style="border:1px solid #94a3b8; padding:6px;">Sınıf Ortalaması</th>
                            </tr>
                        </thead>
                        <tbody>${studentQuizHtml || '<tr><td colspan="3" style="text-align:center; border:1px solid #94a3b8; padding:6px;">Sonuç bulunmuyor.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}