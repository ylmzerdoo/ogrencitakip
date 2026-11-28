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
