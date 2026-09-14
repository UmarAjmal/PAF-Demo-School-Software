'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/app/utils/notify';

const API = process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com";

type Term = { id: number; term_name: string };
type ClassItem = { class_id: number; class_name: string };
type SectionItem = { section_id: number; section_name: string; class_id: number };

type StudentRow = {
    student_id: number;
    first_name: string;
    last_name: string;
    father_name?: string | null;
    admission_no?: string | null;
    roll_no?: string | null;
    marked_subjects: number;
    obtained_marks: number | null;
    total_marks: number | null;
    percentage: number | null;
    grade: string | null;
    position: number | null;
    ordinal_position: string | null;
};

type CardSubjectRow = {
    subject_id: number;
    subject_name: string;
    subject_code?: string | null;
    total_marks: number | null;
    obtained_marks: number | null;
};

type StudentCardItem = {
    student_id: number;
    first_name: string;
    last_name: string;
    father_name?: string | null;
    admission_no?: string | null;
    roll_no?: string | null;
    position: number | null;
    ordinal_position: string | null;
    percentage: number | null;
    grade: string | null;
    subject_rows: CardSubjectRow[];
    grand_total_marks: number;
    grand_obtained_marks: number;
};

type SchoolInfo = {
    school_name?: string;
    school_address?: string;
    phone_number?: string;
    school_phone2?: string;
    school_phone3?: string;
    school_logo_url?: string;
};

type CardPayload = {
    meta: {
        term_name: string;
        year_name: string;
        class_name: string;
        section_name: string;
    };
    school: SchoolInfo;
    students: StudentCardItem[];
};

function esc(text: unknown) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fmtNum(v: number | null | undefined): string {
    if (v === null || v === undefined) return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, '');
}

function getLogoUrl(rawLogo?: string): string {
    if (!rawLogo || !rawLogo.trim()) return '';
    const logoStr = rawLogo.trim();
    if (logoStr.startsWith('http://') || logoStr.startsWith('https://') || logoStr.startsWith('data:')) {
        return logoStr;
    }
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com").replace(/\/+$/, '');
    const cleanPath = logoStr.replace(/^\/+/, '');
    return `${baseUrl}/${cleanPath}`;
}

const GRADE_SCALE = [
    { min: 90, grade: 'A+' },
    { min: 80, grade: 'A' },
    { min: 70, grade: 'B' },
    { min: 60, grade: 'C' },
    { min: 0,  grade: 'D' }
];

function gradeFromPercentage(pct: number | null | undefined): string {
    if (pct === null || pct === undefined || isNaN(pct)) return '';
    for (const band of GRADE_SCALE) {
        if (pct >= band.min) return band.grade;
    }
    return '';
}

function buildPrintHtml(payload: CardPayload, isBatch: boolean): string {
    const { meta, school, students } = payload;
    const schoolName = school.school_name || 'School Name';
    const address = school.school_address || '';
    const phones = [school.phone_number, school.school_phone2, school.school_phone3].filter(Boolean).join(', ');
    const schoolSub = [address, phones ? `Contact: ${phones}` : ''].filter(Boolean).join(' &bull; ') || 'School Address &bull; Contact';
    const logo = getLogoUrl(school.school_logo_url);

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const issueDateStr = `${day} / ${month} / ${year}`;

    const cardsHtml = students.map((student) => {
        const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—';
        const fatherName = (student.father_name && student.father_name.trim()) ? student.father_name.trim() : '—';
        const classSec = `${meta.class_name || ''}${meta.section_name ? ` — ${meta.section_name}` : ''}`.trim() || '—';
        const rollNo = (student.roll_no && String(student.roll_no).trim()) ? String(student.roll_no).trim() : '—';
        const admNo = (student.admission_no && String(student.admission_no).trim()) ? String(student.admission_no).trim() : '—';

        let totalMarksSum = 0;
        let obtainedSum = 0;
        let obtainedCount = 0;

        const subjectRows = student.subject_rows || [];
        const rows = subjectRows.map((sr, idx) => {
            const total = (sr.total_marks !== null && sr.total_marks !== undefined && sr.total_marks > 0) ? sr.total_marks : 100;
            const hasObtained = sr.obtained_marks !== null && sr.obtained_marks !== undefined && !isNaN(Number(sr.obtained_marks));
            const obtained = hasObtained ? Number(sr.obtained_marks) : null;

            totalMarksSum += total;
            if (obtained !== null) {
                obtainedSum += obtained;
                obtainedCount++;
            }

            const pct = (obtained !== null && total > 0)
                ? Math.round((obtained / total) * 1000) / 10
                : null;
            const grade = (pct !== null) ? gradeFromPercentage(pct) : '';

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td class="subject">${esc(sr.subject_name)}</td>
                    <td>${esc(fmtNum(total))}</td>
                    <td>${obtained !== null ? esc(fmtNum(obtained)) : ''}</td>
                    <td>${pct !== null ? `${pct}%` : ''}</td>
                    <td>${esc(grade)}</td>
                </tr>
            `;
        }).join('');

        const overallHasMarks = obtainedCount > 0;
        const calculatedOverallPct = (overallHasMarks && totalMarksSum > 0)
            ? Math.round((obtainedSum / totalMarksSum) * 1000) / 10
            : null;

        const displayPct = student.percentage !== null && student.percentage !== undefined
            ? `${student.percentage}%`
            : (calculatedOverallPct !== null ? `${calculatedOverallPct}%` : '—');

        const displayGrade = student.grade || (calculatedOverallPct !== null ? gradeFromPercentage(calculatedOverallPct) : '—');

        const effectivePctForStatus = student.percentage !== null && student.percentage !== undefined
            ? student.percentage
            : calculatedOverallPct;

        const displayStatus = effectivePctForStatus !== null
            ? (effectivePctForStatus >= 33 ? 'PASS' : 'FAIL')
            : '—';

        const displayPosition = student.ordinal_position || (student.position ? String(student.position) : '—');

        const totalRowHtml = `
            <tr class="total-row">
                <td colspan="2">TOTAL</td>
                <td>${fmtNum(totalMarksSum)}</td>
                <td>${overallHasMarks ? fmtNum(obtainedSum) : ''}</td>
                <td>${displayPct !== '—' ? displayPct : ''}</td>
                <td>&nbsp;</td>
            </tr>
        `;

        const logoHtml = logo
            ? `<div class="logo"><img src="${esc(logo)}" alt="Logo" /></div>`
            : `<div class="logo">SCHOOL<br>LOGO</div>`;

        const sessionParts: string[] = [];
        if (meta.year_name) sessionParts.push(`Academic Session: [ <span>${esc(meta.year_name)}</span> ]`);
        if (meta.term_name) sessionParts.push(`Term: [ <span>${esc(meta.term_name)}</span> ]`);
        const sessionLineHtml = sessionParts.length > 0 ? sessionParts.join(' &nbsp;&bull;&nbsp; ') : 'Academic Session: [ 2025 - 2026 ]';

        return `
            <div class="page-wrap">
              <div class="page">
                <!-- Header -->
                <div class="header">
                  ${logoHtml}
                  <div class="school-block">
                    <div class="school-name">${esc(schoolName)}</div>
                    <div class="school-sub">${schoolSub}</div>
                  </div>
                </div>

                <div class="report-title"><span class="star">&#10022;</span> STUDENT RESULT CARD <span class="star">&#10022;</span></div>
                <div class="session-line">${sessionLineHtml}</div>

                <!-- Student info -->
                <div class="info-block">
                  <div class="line"><span class="label">Student Name :</span> <span>${esc(fullName)}</span></div>
                  <div class="line"><span class="label">Father Name :</span> <span>${esc(fatherName)}</span></div>
                  <div class="line"><span class="label">Class &amp; Sec. :</span> <span>${esc(classSec)}</span></div>
                  <div class="line"><span class="label">Roll No. :</span> <span>${esc(rollNo)}</span></div>
                  <div class="line"><span class="label">Admission No. :</span> <span>${esc(admNo)}</span></div>
                </div>

                <!-- Subject table -->
                <table class="marks-table">
                  <thead>
                    <tr>
                      <th style="width:6%;">S.#</th>
                      <th style="width:36%;">SUBJECT</th>
                      <th style="width:14%;">TOTAL</th>
                      <th style="width:16%;">OBTAINED</th>
                      <th style="width:14%;">%</th>
                      <th style="width:14%;">GRADE</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                    ${totalRowHtml}
                  </tbody>
                </table>

                <!-- Summary line -->
                <div class="summary-line">
                  PERCENTAGE: <span>${displayPct}</span><span class="sep">|</span>
                  GRADE: <span>${displayGrade}</span><span class="sep">|</span>
                  POSITION: <span>${esc(displayPosition)}</span><span class="sep">|</span>
                  STATUS: <span>${displayStatus}</span>
                </div>

                <!-- Grading scale -->
                <div class="grading-line"><span class="gs-label">Grading Scale:</span> A+ (90-100) &nbsp; A (80-89) &nbsp; B (70-79) &nbsp; C (60-69) &nbsp; D (Below 60)</div>

                <!-- Remarks -->
                <div class="remarks-heading">Class Teacher's Remarks</div>
                <div class="remarks-line"></div>
                <div class="remarks-line"></div>

                <div class="bottom-spacer"></div>

                <!-- Signatures -->
                <div class="signatures">
                  <div class="sig">
                    <div class="sig-line"></div>
                    <div class="sig-label">Class Teacher</div>
                  </div>
                  <div class="sig">
                    <div class="sig-line"></div>
                    <div class="sig-label">Exam Controller</div>
                  </div>
                  <div class="sig">
                    <div class="sig-line"></div>
                    <div class="sig-label">Principal</div>
                  </div>
                </div>

                <div class="issue-date">Date of Issue: [ <span>${issueDateStr}</span> ]</div>

                <!-- Developer Footer Line -->
                <div class="developer-footer">
                  Software designed and developed by <strong>FALCON SWIFT PVT. LTD.</strong> &bull; Website: <strong>www.falconswift.online</strong> &bull; Contact: <strong>03208624173, 03263392082</strong>
                </div>
              </div>
            </div>
        `;
    }).join(isBatch ? '<div class="page-break"></div>' : '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Student Result Card – ${esc(meta.class_name)} (${esc(meta.section_name)})</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 10mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: "Times New Roman", Times, serif;
    color: #1a1a1a;
    background: #e5e5e5;
  }
  .page-wrap {
    display: flex;
    justify-content: center;
  }
  .page {
    width: 210mm;
    min-height: 277mm;
    padding: 8mm 12mm;
    margin: 8mm auto 20mm auto;
    background: #fff;
    box-shadow: 0 0 8px rgba(0,0,0,0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  /* ---------- Header ---------- */
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #000;
    margin-bottom: 10px;
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 2px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 8px;
    font-weight: bold;
    line-height: 1.1;
    flex-shrink: 0;
    padding: 3px;
    color: #000;
    overflow: hidden;
  }
  .logo img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .school-block { flex: 1; text-align: left; }
  .school-name {
    font-size: 24px;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin: 0;
    color: #000;
    text-transform: uppercase;
  }
  .school-sub {
    font-size: 12px;
    color: #000;
    margin-top: 2px;
    line-height: 1.3;
  }

  /* ---------- Title ---------- */
  .report-title {
    text-align: center;
    font-size: 19px;
    font-weight: bold;
    letter-spacing: 2px;
    color: #000;
    margin: 4px 0 2px 0;
  }
  .report-title .star { color: #000; }
  .session-line {
    text-align: center;
    font-size: 13px;
    font-style: italic;
    margin-bottom: 10px;
    color: #000;
  }

  /* ---------- Student info (stacked lines) ---------- */
  .info-block {
    font-size: 13.5px;
    margin-bottom: 10px;
    padding: 6px 0;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
  }
  .info-block .line { padding: 2px 4px; }
  .info-block .label { font-weight: bold; display: inline-block; min-width: 130px; }

  /* ---------- Subject table ---------- */
  .marks-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }
  .marks-table th, .marks-table td {
    border: 1px solid #000;
    padding: 5px 8px;
    font-size: 13px;
    text-align: center;
  }
  .marks-table th {
    background: #d9d9d9;
    color: #000;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .marks-table td.subject { text-align: left; }
  .marks-table tr.total-row td {
    font-weight: bold;
    background: #f2f2f2;
  }

  /* ---------- Summary line ---------- */
  .summary-line {
    text-align: center;
    font-size: 13.5px;
    font-weight: bold;
    padding: 7px;
    background: #f2f2f2;
    border: 1px solid #000;
    margin-bottom: 10px;
    letter-spacing: 0.3px;
  }
  .summary-line .sep { color: #000; margin: 0 8px; font-weight: normal; }

  /* ---------- Grading scale ---------- */
  .grading-line {
    text-align: center;
    font-size: 12px;
    margin-bottom: 10px;
    color: #000;
  }
  .grading-line .gs-label { font-weight: bold; }

  /* ---------- Remarks ---------- */
  .remarks-heading {
    font-weight: bold;
    font-size: 13px;
    margin: 0 0 5px 0;
  }
  .remarks-line {
    border-bottom: 1px solid #000;
    height: 18px;
    margin-bottom: 4px;
  }

  .bottom-spacer { flex: 1; min-height: 15px; }

  /* ---------- Signatures ---------- */
  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 25px;
    text-align: center;
  }
  .signatures .sig { flex: 1; }
  .sig-line {
    border-bottom: 1px solid #000;
    width: 78%;
    margin: 0 auto 6px auto;
    height: 20px;
  }
  .sig-label {
    font-size: 12px;
    font-weight: bold;
    color: #000;
  }
  .issue-date {
    text-align: center;
    font-style: italic;
    font-size: 11.5px;
    margin-top: 12px;
    color: #000;
  }

  /* ---------- Developer Footer Line ---------- */
  .developer-footer {
    text-align: center;
    font-size: 9.5px;
    color: #333;
    letter-spacing: 0.2px;
    margin-top: 10px;
    padding-top: 5px;
    border-top: 1px dashed #aaa;
    font-family: Arial, Helvetica, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .developer-footer strong {
    color: #111;
  }

  @media print {
    body { background: #fff; margin: 0; padding: 0; }
    .page-wrap { display: block; margin: 0; padding: 0; }
    .page {
      box-shadow: none;
      margin: 0 auto;
      padding: 6mm 10mm;
      width: 100%;
      height: 275mm;
      max-height: 275mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
      height: 0;
    }
  }
</style>
</head>
<body onload="window.print()">
  ${cardsHtml}
</body>
</html>`;
}

export default function ResultCardPage() {
    const { user } = useAuth();

    const [loadingContext, setLoadingContext] = useState(true);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [openingStudentId, setOpeningStudentId] = useState<number | null>(null);

    const [activeYearName, setActiveYearName] = useState('');
    const [terms, setTerms] = useState<Term[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sections, setSections] = useState<SectionItem[]>([]);

    const [selectedTerm, setSelectedTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');

    const [students, setStudents] = useState<StudentRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const canUsePage = !!user;

    const filteredSections = useMemo(() => {
        if (!selectedClass) return [];
        return sections.filter((s) => s.class_id === Number(selectedClass));
    }, [sections, selectedClass]);

    const ready = !!(selectedTerm && selectedClass && selectedSection && user?.id);

    const loadContext = async () => {
        if (!user?.id) {
            setLoadingContext(false);
            return;
        }

        setLoadingContext(true);
        try {
            const r = await fetch(`${API}/exams/context/class-teacher?user_id=${user.id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load context');

            const nextTerms = Array.isArray(d.terms) ? d.terms : [];
            const nextClasses = Array.isArray(d.classes) ? d.classes : [];
            const nextSections = Array.isArray(d.sections) ? d.sections : [];

            setTerms(nextTerms);
            setClasses(nextClasses);
            setSections(nextSections);
            setActiveYearName(d.active_year?.year_name || '');

            setSelectedTerm((prev) => {
                if (prev && nextTerms.some((t: Term) => String(t.id) === prev)) return prev;
                return nextTerms.length > 0 ? String(nextTerms[0].id) : '';
            });

            setSelectedClass((prev) => {
                if (prev && nextClasses.some((c: ClassItem) => String(c.class_id) === prev)) return prev;
                return nextClasses.length > 0 ? String(nextClasses[0].class_id) : '';
            });
        } catch (e: any) {
            notify.error(e.message || 'Failed to load context');
        } finally {
            setLoadingContext(false);
        }
    };

    const loadStudents = async () => {
        if (!ready || !user?.id) return;
        setLoadingStudents(true);
        try {
            const params = new URLSearchParams({
                user_id: String(user.id),
                term_id: selectedTerm,
                class_id: selectedClass,
                section_id: selectedSection
            });

            const r = await fetch(`${API}/exams/result-card/students?${params.toString()}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to load students');

            setStudents(Array.isArray(d.students) ? d.students : []);
            setSelectedIds(new Set());
        } catch (e: any) {
            setStudents([]);
            setSelectedIds(new Set());
            notify.error(e.message || 'Failed to load students');
        } finally {
            setLoadingStudents(false);
        }
    };

    const fetchCards = async (studentIds: number[]): Promise<CardPayload> => {
        if (!user?.id || !ready) throw new Error('Please select term, class and section first');

        const r = await fetch(`${API}/exams/result-card/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: user.id,
                term_id: Number(selectedTerm),
                class_id: Number(selectedClass),
                section_id: Number(selectedSection),
                student_ids: studentIds
            })
        });

        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load result card data');

        return d as CardPayload;
    };

    const openInNewTab = (html: string) => {
        const win = window.open('', '_blank', 'width=1100,height=900');
        if (!win) {
            notify.warning('Popup blocked. Please allow popups for this site and try again.');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
    };

    const openStudentCard = async (studentId: number) => {
        if (openingStudentId !== null) return;
        setOpeningStudentId(studentId);
        try {
            const payload = await fetchCards([studentId]);
            if (!payload.students || payload.students.length === 0) {
                throw new Error('No result data found for this student');
            }

            // Sync father_name from loaded student list if missing from payload
            const local = students.find((s) => s.student_id === studentId);
            if (local?.father_name && (!payload.students[0].father_name || !payload.students[0].father_name.trim())) {
                payload.students[0].father_name = local.father_name.trim();
            }

            openInNewTab(buildPrintHtml(payload, false));
            notify.success('Result card opened.');
        } catch (e: any) {
            notify.error(e.message || 'Failed to open result card');
        } finally {
            setOpeningStudentId(null);
        }
    };

    const handlePrintSelected = async () => {
        if (selectedIds.size === 0) {
            notify.warning('Select one or more students to print.');
            return;
        }

        setPrinting(true);
        try {
            const payload = await fetchCards(Array.from(selectedIds));
            // Sync father_name for all batch items if missing from payload
            payload.students.forEach((st) => {
                if (!st.father_name || !st.father_name.trim()) {
                    const local = students.find((s) => s.student_id === st.student_id);
                    if (local?.father_name && local.father_name.trim()) {
                        st.father_name = local.father_name.trim();
                    }
                }
            });
            openInNewTab(buildPrintHtml(payload, true));
            notify.success('Printing result cards.');
        } catch (e: any) {
            notify.error(e.message || 'Failed to print result cards');
        } finally {
            setPrinting(false);
        }
    };

    useEffect(() => {
        loadContext();
    }, [user?.id]);

    useEffect(() => {
        setSelectedSection('');
        setStudents([]);
        setSelectedIds(new Set());
    }, [selectedClass]);

    useEffect(() => {
        setStudents([]);
        setSelectedIds(new Set());
    }, [selectedTerm, selectedSection]);

    useEffect(() => {
        if (filteredSections.length === 1 && !selectedSection) {
            setSelectedSection(String(filteredSections[0].section_id));
        }
    }, [filteredSections, selectedSection]);

    useEffect(() => {
        if (ready) {
            loadStudents();
        }
    }, [ready, selectedTerm, selectedClass, selectedSection]);

    const allVisibleSelected = students.length > 0 && students.every((s) => selectedIds.has(s.student_id));

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(students.map((s) => s.student_id)));
        }
    };

    const toggleStudent = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!canUsePage) {
        return (
            <div className="container py-4">
                <div className="alert alert-danger mb-0">You do not have permission to access Result Card.</div>
            </div>
        );
    }

    return (
        <div className="page-wrap" style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh', paddingBottom: '3rem' }}>
            
            {/* Header Bar */}
            <div className="d-flex flex-wrap align-items-center justify-content-between mb-4">
                <div>
                    <h4 className="mb-1 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-file-earmark-text me-2" style={{ color: 'var(--accent-orange)' }} />
                        Student Result Cards
                    </h4>
                    <div className="text-muted small">Generate and print term result cards per student</div>
                </div>
                <span className="badge rounded-pill bg-dark text-white px-3 py-2 border shadow-xs">
                    <i className="bi bi-calendar3 me-1" /> Session: {activeYearName || 'Active Year'}
                </span>
            </div>

            {/* Seamless Filter Controls */}
            <div className="card border-0 shadow-sm mb-4">
                <div className="card-header bg-white border-bottom py-3" style={{ borderLeft: '4px solid var(--primary-teal)' }}>
                    <h6 className="mb-0 fw-bold" style={{ color: 'var(--primary-dark)' }}>
                        <i className="bi bi-sliders me-2" style={{ color: 'var(--primary-teal)' }} />
                        Select Class Target (Auto-loads Students)
                    </h6>
                </div>
                <div className="card-body p-4">
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">1</span> Select Term
                            </label>
                            <select className="form-select form-select-md border-2" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)} disabled={loadingContext}>
                                <option value="">-- Choose Term --</option>
                                {terms.map((t) => (
                                    <option key={t.id} value={t.id}>{t.term_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-md-4">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">2</span> Select Class
                            </label>
                            <select className="form-select form-select-md border-2" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} disabled={loadingContext}>
                                <option value="">-- Choose Class --</option>
                                {classes.map((c) => (
                                    <option key={c.class_id} value={c.class_id}>{c.class_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-md-4">
                            <label className="form-label fw-semibold text-dark small mb-1">
                                <span className="badge bg-dark text-white me-1">3</span> Select Section
                            </label>
                            <select
                                className="form-select form-select-md border-2"
                                value={selectedSection}
                                onChange={(e) => setSelectedSection(e.target.value)}
                                disabled={!selectedClass || loadingContext}
                            >
                                <option value="">-- Choose Section --</option>
                                {filteredSections.map((s) => (
                                    <option key={s.section_id} value={s.section_id}>{s.section_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Student List & Batch Action Card */}
            {ready && (
                <div className="card border-0 shadow-sm">
                    <div className="card-header bg-white border-bottom p-3 d-flex flex-wrap align-items-center justify-content-between gap-3"
                        style={{ borderLeft: '4px solid #10b981' }}>
                        <div>
                            <h5 className="mb-0 fw-bold text-dark">
                                <i className="bi bi-people me-2 text-success" />
                                Student List ({students.length} Students)
                            </h5>
                            <div className="text-muted extra-small mt-1">
                                Select individual students or batch print all result cards at once.
                            </div>
                        </div>

                        {students.length > 0 && (
                            <div className="d-flex align-items-center gap-2">
                                <button className="btn btn-outline-secondary btn-sm rounded-pill px-3" onClick={toggleSelectAll}>
                                    {allVisibleSelected ? 'Deselect All' : 'Select All'}
                                </button>
                                <button
                                    className="btn btn-success fw-bold px-4 rounded-pill shadow-xs"
                                    onClick={handlePrintSelected}
                                    disabled={printing || selectedIds.size === 0}
                                >
                                    {printing ? <><span className="spinner-border spinner-border-sm me-1" />Printing...</> : <><i className="bi bi-printer-fill me-1" />Print Selected Cards ({selectedIds.size})</>}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="card-body p-0">
                        {loadingStudents ? (
                            <div className="py-5 text-center text-muted">
                                <span className="spinner-border text-primary me-2" />Loading student result cards list...
                            </div>
                        ) : students.length === 0 ? (
                            <div className="py-5 text-center text-muted">No active students found for selected class & section.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-dark">
                                        <tr>
                                            <th style={{ width: '40px' }} className="ps-4">
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th style={{ width: '80px' }}>Roll No</th>
                                            <th style={{ width: '140px' }}>Admission No</th>
                                            <th>Student Name</th>
                                            <th className="text-center">Evaluated Subjects</th>
                                            <th className="text-center">Position</th>
                                            <th className="text-center">Percentage</th>
                                            <th className="text-center">Grade</th>
                                            <th className="text-end pe-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map((s) => {
                                            const isChecked = selectedIds.has(s.student_id);
                                            const isOpening = openingStudentId === s.student_id;

                                            return (
                                                <tr key={s.student_id} className={isChecked ? 'table-light' : ''}>
                                                    <td className="ps-4">
                                                        <input
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={isChecked}
                                                            onChange={() => toggleStudent(s.student_id)}
                                                        />
                                                    </td>
                                                    <td className="fw-bold text-dark">{s.roll_no || '—'}</td>
                                                    <td className="text-muted small">{s.admission_no || '—'}</td>
                                                    <td>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <div
                                                                className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold"
                                                                style={{ width: 32, height: 32, fontSize: '0.85rem' }}
                                                            >
                                                                {s.first_name[0]}{s.last_name[0] || ''}
                                                            </div>
                                                            <div>
                                                                <div className="fw-semibold text-dark">{s.first_name} {s.last_name}</div>
                                                                {s.father_name && <div className="text-muted extra-small">S/D/O {s.father_name}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-center">
                                                        <span className={`badge ${s.marked_subjects > 0 ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'}`}>
                                                            {s.marked_subjects} Subjects
                                                        </span>
                                                    </td>
                                                    <td className="text-center">
                                                        {s.ordinal_position ? (
                                                            <span className="badge bg-indigo text-white px-3 py-1 rounded-pill fw-bold">
                                                                {s.ordinal_position}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted extra-small">—</span>
                                                        )}
                                                    </td>
                                                    <td className="text-center fw-bold text-dark">
                                                        {s.percentage !== null ? `${s.percentage}%` : '—'}
                                                    </td>
                                                    <td className="text-center">
                                                        {s.grade ? (
                                                            <span className={`badge ${s.grade === 'F' ? 'bg-danger' : s.grade === 'A+' ? 'bg-success' : 'bg-primary'}`}>
                                                                {s.grade}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted extra-small">—</span>
                                                        )}
                                                    </td>
                                                    <td className="text-end pe-4">
                                                        <button
                                                            className="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold"
                                                            onClick={() => openStudentCard(s.student_id)}
                                                            disabled={isOpening}
                                                        >
                                                            {isOpening ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-file-earmark-text me-1" />}
                                                            Open Card
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
