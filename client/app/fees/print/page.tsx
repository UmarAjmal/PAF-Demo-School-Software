'use client';
import React, { useState, useEffect } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const API = process.env.NEXT_PUBLIC_API_URL || "https://demo-school-soxa.onrender.com";

interface SlipData {
    slip_id: number; student_id: number; family_id: string; class_id: number;
    total_amount: number; paid_amount: number; status: string; due_date: string; issue_date?: string;
    is_printed: boolean; printed_at: string;
    first_name: string; last_name: string; admission_no: string; monthly_fee: number; father_name: string;
    class_name: string; c_class_id: number;
    line_items: { item_id: number; head_name: string; amount: number; note?: string }[];
}
interface Voucher {
    voucher_type: 'individual' | 'family';
    primary: SlipData; siblings: SlipData[];
    family_id: string | null; total_family_amount: number; total_paid: number;
    is_printed: boolean; partial_printed?: boolean; slip_ids: number[];
    family_members?: { student_id: number; first_name: string; last_name: string; father_name: string; class_name: string; class_id: number; section_name?: string }[];
    pending_months_count?: number;
}
interface SchoolInfo {
    school_name: string; school_address: string; phone_number: string;
    school_phone2: string; school_phone3: string; school_logo_url: string;
}

function fmtAmt(n: number) { return `${Number(n || 0).toLocaleString('en-PK')}/-`; }
function fmtDate(d: string | Date | null) {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function zeroPad(n: number, digits = 6) { return String(n).padStart(digits, '0'); }

function VoucherSlip({ v, serial, month, year, school, filterClassId }: { v: Voucher; serial: number; month: string; year: string; school: SchoolInfo; filterClassId?: string }) {
    const mIdx = parseInt(month) - 1;
    const monthName = MONTHS[mIdx] || '';
    const voucherNo = `${MONTH_SHORT[mIdx] || 'FEE'}${zeroPad(serial)}`;
    const dueDate = v.primary.due_date ? fmtDate(v.primary.due_date) : '--';
    const issueDate = v.primary.issue_date ? fmtDate(v.primary.issue_date) : fmtDate(new Date());

    const allStudents: SlipData[] = [v.primary, ...v.siblings];

    let membersSource = v.family_members && v.family_members.length > 0
        ? [...v.family_members]
        : allStudents.map(s => ({
            first_name: s.first_name,
            last_name: s.last_name,
            father_name: s.father_name,
            class_name: s.class_name,
            section_name: (s as any).section_name,
            class_id: s.c_class_id
        }));

    if (filterClassId && v.voucher_type === 'family') {
        membersSource.sort((a, b) => {
            const aMatch = (a as any).class_id?.toString() === filterClassId ? 0 : 1;
            const bMatch = (b as any).class_id?.toString() === filterClassId ? 0 : 1;
            return aMatch - bMatch;
        });
    }

    const rawStudentRows = membersSource.map(m => ({
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
        father: m.father_name || '',
        cls: `${m.class_name || ''}${(m as any).section_name ? ` (${(m as any).section_name})` : ''}`
    }));

    const studentRows = rawStudentRows.length > 0 ? rawStudentRows.slice(0, 4) : [{ name: '', father: '', cls: '' }];

    const regularFeeItems: { desc: string; amount: number }[] = [];
    let lateFineAmount = 0;
    let fineAfterDay = (v.primary as any).fine_after_day || null;

    const itemMap = new Map<string, number>();

    for (const item of (v.primary.line_items || [])) {
        const rawName = (item.head_name || '').trim();
        const isFine = rawName.toLowerCase().includes('late') || rawName.toLowerCase().includes('fine');
        const amt = parseFloat(item.amount as any) || 0;

        if (isFine) {
            lateFineAmount += amt;
            if ((item as any).fine_after_day) fineAfterDay = (item as any).fine_after_day;
            continue;
        }

        const displayName = rawName.replace(/Family Monthly Fee/i, 'Monthly Fee');
        const isTuition = displayName.toLowerCase().includes('monthly fee') || displayName.toLowerCase().includes('tuition');
        const isPb = displayName.toLowerCase().includes('previous balance') || displayName.toLowerCase().includes('opening balance');
        
        let desc = displayName;
        if (isPb) {
            desc = 'Previous Balance';
        } else if (isTuition) {
            desc = displayName.includes('(') ? displayName : `${displayName} (${monthName})`;
        } else if ((item as any).is_carried_forward || item.note?.toLowerCase().includes('carried') || item.note?.toLowerCase().includes('arrears')) {
            desc = `${displayName} (Arrears)`;
        } else {
            desc = displayName;
        }

        itemMap.set(desc, (itemMap.get(desc) || 0) + amt);
    }

    const isTrustedVoucher = Boolean(
        (v.primary as any).is_trusted ||
        ((v.primary as any).category && (v.primary as any).category.trim().toLowerCase() === 'trusted') ||
        (v.family_members && v.family_members.length > 0 && v.family_members.every((m: any) => (m.category || '').toLowerCase() === 'trusted'))
    );

    itemMap.forEach((amt, desc) => {
        regularFeeItems.push({ desc, amount: amt });
    });

    if (isTrustedVoucher) {
        let tuitionSum = 0;
        itemMap.forEach((amt, desc) => {
            if (desc.toLowerCase().includes('monthly fee') || desc.toLowerCase().includes('tuition')) {
                tuitionSum += amt;
            }
        });
        if (tuitionSum > 0) {
            regularFeeItems.push({ desc: 'Tuition Concession (Trusted)', amount: -tuitionSum });
        }
    }

    const totalPaid = parseFloat(v.total_paid as any) || 0;
    if (totalPaid > 0) {
        regularFeeItems.push({ desc: 'Amount Already Paid', amount: -totalPaid });
    }

    if (regularFeeItems.length === 0) {
        regularFeeItems.push({ desc: 'Monthly Fee', amount: parseFloat(v.total_family_amount as any) || 0 });
    }

    const feeRows = regularFeeItems.slice(0, 4);
    const totalAmountWithinDueDate = regularFeeItems.reduce((sum, f) => sum + (f.amount || 0), 0);
    const totalAmountAfterDueDate = totalAmountWithinDueDate + lateFineAmount;

    let fineCutoffDateStr = dueDate;
    if (fineAfterDay && parseInt(fineAfterDay) > 0) {
        const d = String(fineAfterDay).padStart(2, '0');
        fineCutoffDateStr = `${d} ${monthName ? monthName.substring(0, 3) : ''} ${year}`;
    }

    const pendingMonths = v.pending_months_count || (v.primary as any).pending_months_count || 1;

    const schoolName = school.school_name || 'Shaheen English Model School Vehari';
    const schoolAddress = school.school_address || '83/M Madina Colony Vehari';
    const schoolPhones = [school.phone_number, school.school_phone2, school.school_phone3].filter(Boolean).join(' ; ') || '0300-7730141 ; 0308-7696430 ; 067-3366383';

    return (
        <div className="voucher">
            <div className="voucher-header">
                <div className="logo-placeholder">
                    {school.school_logo_url ? (
                        <img src={school.school_logo_url} alt="Logo" />
                    ) : null}
                </div>
                <div className="school-name">{schoolName}</div>
            </div>
            <div className="school-address">{schoolAddress}</div>
            <div className="school-contact">{schoolPhones}</div>
            <div className="divider"></div>
            <div className="voucher-type">Monthly Fee Voucher</div>
            <div className="divider"></div>
            <div className="voucher-details">
                <span className="detail-group">Voucher No: <span className="number">{voucherNo}</span></span>
                <span className="detail-group">Family ID: <span className="family-id">{v.family_id || '—'}</span></span>
            </div>
            <div className="voucher-date-line">
                <span className="detail-group">Issue date: <span className="date-value">{issueDate}</span></span>
                <span className="detail-group">Due date: <span className="date-value">{dueDate}</span></span>
            </div>
            <div className="voucher-body">
                <div className="student-details">Student Details</div>
                <table className="students-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Father Name</th>
                            <th>Class (Sec)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {studentRows.map((s, i) => (
                            <tr key={i}>
                                <td>{s.name || '\u00A0'}</td>
                                <td>{s.father || '\u00A0'}</td>
                                <td>{s.cls || '\u00A0'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="fee-desc">Fee Details</div>
                <table className="fee-table">
                    <thead>
                        <tr>
                            <th>Sr.#</th>
                            <th>Fee Description</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {feeRows.map((f, i) => (
                            <tr key={i}>
                                <td>{i + 1}</td>
                                <td>{f.desc || '\u00A0'}</td>
                                <td>{fmtAmt(f.amount)}</td>
                            </tr>
                        ))}
                        <tr className="total-row">
                            <td>{feeRows.length + 1}</td>
                            <td>Total Amount</td>
                            <td>{fmtAmt(totalAmountWithinDueDate)}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="rules-section">
                    <div className="rules-box">
                        <span className="rule-line">1. Fee must be paid before the due date.</span>
                        <span className="rule-line">2. A fine/late fee will apply after {fineCutoffDateStr !== '--' ? fineCutoffDateStr : 'the due date'}.</span>
                        <span className="rule-line">3. Fee must be deposited only at school-designated bank/counter.</span>
                        <span className="rule-line">4. Fee once paid is non-refundable under any circumstances.</span>
                    </div>
                    <div className="software-instructions">
                        <span className="instructions-label">Software Instructions:</span>
                        <div>• Retain slip copy for computerized fee verification.</div>
                        {pendingMonths >= 2 && (
                            <div>• Notice: Previous {pendingMonths} months dues pending. Please deposit dues immediately.</div>
                        )}
                        {lateFineAmount > 0 && (
                            <div>• Late fine of {fmtAmt(lateFineAmount)} applicable post {fineCutoffDateStr} (Total: {fmtAmt(totalAmountAfterDueDate)}).</div>
                        )}
                    </div>
                    <div className="developer-credit">Software designed and developed by FALCON SWIFT PVT. LTD. webiste: www.falconswift.online contact 03208624173, 03263392082</div>
                </div>
            </div>
        </div>
    );
}

function VoucherCard({ v, idx, selected, onToggle, filterClassId }: { v: Voucher; idx: number; selected: boolean; onToggle: () => void; filterClassId?: string }) {
    const remaining = parseFloat(v.total_family_amount as any) - parseFloat(v.total_paid as any);
    const isFam = v.voucher_type === 'family';

    const allMembers = (v.family_members && v.family_members.length > 0)
        ? v.family_members
        : [v.primary, ...v.siblings];

    const displayPrimary = (filterClassId && isFam && v.family_members && v.family_members.length > 0)
        ? (v.family_members.find(m => m.class_id?.toString() === filterClassId) || v.primary)
        : v.primary;

    return (
        <div className={`card border-0 shadow-sm mb-2${selected ? ' border border-primary' : ''}`}
            style={{ borderLeft: `4px solid ${v.is_printed ? '#198754' : isFam ? '#215E61' : '#FE7F2D'}`, cursor: 'pointer' }}
            onClick={onToggle}>
            <div className="card-body py-2 px-3">
                <div className="d-flex align-items-start gap-3">
                    <input type="checkbox" className="form-check-input mt-1" checked={selected} readOnly
                        onClick={e => e.stopPropagation()} onChange={onToggle} />
                    <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-start">
                            <div>
                                <span className="fw-bold text-dark me-2">{displayPrimary.first_name} {displayPrimary.last_name}</span>
                                <span className="badge rounded-pill bg-light text-dark border me-1">{(displayPrimary as any).class_name || v.primary.class_name}</span>
                                {isFam && <span className="badge rounded-pill me-1" style={{ backgroundColor: '#215E61', color: '#fff' }}>
                                    <i className="bi bi-people-fill me-1"></i>Family ({allMembers.length})
                                </span>}
                                {v.is_printed && <span className="badge bg-success rounded-pill"><i className="bi bi-printer-fill me-1"></i>Printed</span>}
                                {v.partial_printed && <span className="badge bg-warning text-dark rounded-pill">Partial</span>}
                            </div>
                            <div className="text-end">
                                <div className="fw-bold small" style={{ color: 'var(--primary-dark)' }}>PKR {Number(v.total_family_amount).toLocaleString()}</div>
                                {remaining > 0 && <div className="text-danger" style={{ fontSize: '0.72rem' }}>Due: {Number(remaining).toLocaleString()}</div>}
                            </div>
                        </div>
                        {isFam && allMembers.length > 0 && (
                            <div className="d-flex flex-wrap gap-1 mt-1">
                                {allMembers.map((m, i) => (
                                    <span key={i} className="badge bg-light text-dark border" style={{ fontSize: '0.7rem' }}>
                                        {m.first_name} {m.last_name} ({(m as any).class_name || (m as any).c_class_name})
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            Adm: {v.primary.admission_no}
                            {v.primary.printed_at && <span className="ms-2">Printed: {new Date(v.primary.printed_at).toLocaleDateString('en-PK')}</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface AvailableMonth {
    value: string;
    label: string;
    months: number[];
}

export default function PrintSlipsPage() {
    const [month, setMonth] = useState('');
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [classId, setClassId] = useState('');
    const [academicYears, setAcademicYears] = useState<{ id: number; year_name: string; is_active: boolean }[]>([]);
    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('all');
    const [activeYear, setActiveYear] = useState<{ id: number; year_name: string; is_active: boolean } | null>(null);
    const [classes, setClasses] = useState<{ class_id: number; class_name: string }[]>([]);
    const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [coveredStudents, setCoveredStudents] = useState<any[]>([]);
    const [stats, setStats] = useState<{ total_vouchers: number; printed: number; pending: number; family_vouchers: number } | null>(null);
    const [school, setSchool] = useState<SchoolInfo>({ school_name: '', school_address: '', phone_number: '', school_phone2: '', school_phone3: '', school_logo_url: '' });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingSlipIds, setPendingSlipIds] = useState<number[]>([]);
    const [markingPrinted, setMarkingPrinted] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        fetch(`${API}/academic`).then(r => r.json()).then(setClasses).catch(() => { });
        fetch(`${API}/academic/years`).then(r => r.json()).then(data => {
            if (Array.isArray(data)) {
                setAcademicYears(data);
                const active = data.find(y => y.is_active);
                if (active) {
                    setActiveYear(active);
                    setSelectedAcademicYear(active.id.toString());
                }
            }
        }).catch(() => {});
        fetch(`${API}/academic/active-year`).then(r => r.json()).then(data => {
            if (data && data.id) {
                setActiveYear(data);
                setSelectedAcademicYear(data.id.toString());
                const startY = data.start_date ? new Date(data.start_date).getFullYear().toString() : (data.year_name ? data.year_name.split('-')[0].trim() : new Date().getFullYear().toString());
                if (startY && !isNaN(parseInt(startY))) {
                    setYear(startY);
                }
            }
        }).catch(() => {});

        fetch(`${API}/settings`).then(r => r.json()).then((data: any) => {
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const getLogo = (raw?: string) => {
                    if (!raw || !raw.trim()) return `${API}/icon.png`;
                    const s = raw.trim();
                    if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) return s;
                    return `${API}/${s.replace(/^\/+/, '')}`;
                };
                setSchool({
                    school_name: data.school_name || '',
                    school_address: data.address || '',
                    phone_number: data.contact_number || '',
                    school_phone2: '',
                    school_phone3: '',
                    school_logo_url: getLogo(data.logo_url)
                });
            }
        }).catch(() => { });
    }, []);

    useEffect(() => {
        const targetYearId = (selectedAcademicYear && selectedAcademicYear !== 'all') ? selectedAcademicYear : (activeYear ? activeYear.id.toString() : '');
        const yrParam = targetYearId ? `&academic_year_id=${targetYearId}` : '';
        fetch(`${API}/fee-slips/available-months?year=${year}${yrParam}`)
            .then(r => r.json())
            .then(data => {
                if (data.months) {
                    setAvailableMonths(data.months);
                    if (data.months.length > 0) {
                        const currentM = (new Date().getMonth() + 1).toString();
                        const isCurrentValid = data.months.some((m: AvailableMonth) => m.months.includes(parseInt(currentM)));
                        if (!isCurrentValid) {
                            setMonth(data.months[data.months.length - 1].value);
                        } else {
                            const exact = data.months.find((m: AvailableMonth) => m.months.includes(parseInt(currentM)));
                            if (exact) setMonth(exact.value);
                        }
                    } else {
                        setMonth('');
                    }
                }
            })
            .catch(() => { });
    }, [year, selectedAcademicYear, activeYear]);

    const loadQueue = async () => {
        if (!month || !year) {
            setMessage({ type: 'danger', text: 'Please select Month and Year.' });
            return;
        }
        setLoading(true); setMessage(null); setSelected(new Set()); setVouchers([]); setCoveredStudents([]); setStats(null);
        try {
            const targetYearId = (selectedAcademicYear && selectedAcademicYear !== 'all') ? selectedAcademicYear : (activeYear ? activeYear.id.toString() : '');
            const yrParam = targetYearId ? `&academic_year_id=${targetYearId}` : '';
            const url = `${API}/fee-slips/print-queue?month=${month}&year=${year}${classId ? `&class_id=${classId}` : ''}${yrParam}`;
            const r = await fetch(url);
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);

            const getClassRank = (className?: string, classId?: number) => {
                if (!className) return typeof classId === 'number' ? classId : 0;
                const name = className.toString().trim().toLowerCase();
                const numMatch = name.match(/\b(\d+)(?:st|nd|rd|th)?\b/) || name.match(/(\d+)/);
                if (numMatch) return parseInt(numMatch[1], 10);
                if (name.includes('prep') || name.includes('kg') || name.includes('kindergarten')) return 0;
                if (name.includes('nursery')) return -1;
                if (name.includes('play') || name.includes('pg') || name.includes('daycare') || name.includes('montessori')) return -2;
                return typeof classId === 'number' ? classId : 0;
            };

            const compareSections = (secA?: string, secB?: string) => {
                const sA = (secA || '').toString().trim().toLowerCase();
                const sB = (secB || '').toString().trim().toLowerCase();
                if (!sA && !sB) return 0;
                if (!sA) return 1;
                if (!sB) return -1;
                return sA.localeCompare(sB, undefined, { sensitivity: 'base' });
            };

            const sortedList = (data.vouchers || []).sort((a: Voucher, b: Voucher) => {
                const rankA = getClassRank(a.primary.class_name, a.primary.c_class_id || a.primary.class_id);
                const rankB = getClassRank(b.primary.class_name, b.primary.c_class_id || b.primary.class_id);
                if (rankA !== rankB) return rankB - rankA;

                const clsA = (a.primary.class_name || '').trim().toLowerCase();
                const clsB = (b.primary.class_name || '').trim().toLowerCase();
                if (clsA !== clsB) {
                    const clsComp = clsA.localeCompare(clsB);
                    if (clsComp !== 0) return clsComp;
                }

                const secComp = compareSections((a.primary as any).section_name, (b.primary as any).section_name);
                if (secComp !== 0) return secComp;

                if (!a.is_printed && b.is_printed) return -1;
                if (a.is_printed && !b.is_printed) return 1;

                const nameA = `${a.primary.first_name || ''} ${a.primary.last_name || ''}`.trim().toLowerCase();
                const nameB = `${b.primary.first_name || ''} ${b.primary.last_name || ''}`.trim().toLowerCase();
                return nameA.localeCompare(nameB);
            });

            setVouchers(sortedList);
            setCoveredStudents(data.covered_students || []);
            setStats(data.stats || null);
        } catch (err: any) { setMessage({ type: 'danger', text: err.message }); }
        finally { setLoading(false); }
    };

    const toggleSelect = (idx: number) => { setSelected(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; }); };
    const selectAllPending = () => setSelected(new Set(vouchers.map((v, i) => i).filter(i => !vouchers[i].is_printed)));
    const selectAll = () => setSelected(new Set(vouchers.map((_, i) => i)));
    const clearAll = () => setSelected(new Set());

    const selectedVouchers = Array.from(selected).sort((a, b) => a - b).map(i => vouchers[i]).filter(Boolean);
    const allSlipIds = selectedVouchers.flatMap(v => v.slip_ids);
    const pages: Voucher[][] = [];
    for (let i = 0; i < selectedVouchers.length; i += 4) pages.push(selectedVouchers.slice(i, i + 4));
    const voucherSerials = new Map<number, number>();
    vouchers.forEach((v, i) => { voucherSerials.set(v.slip_ids[0], i + 1); });
    const getSerial = (v: Voucher) => voucherSerials.get(v.slip_ids[0]) || 1;

    useEffect(() => {
        if (!printing) return;
        let cancelled = false;

        const t = setTimeout(() => {
            if (cancelled) return;

            const doAfterImagesLoad = () => {
                if (cancelled) return;
                window.print();
                setTimeout(() => { setShowConfirm(true); setPrinting(false); }, 600);
            };

            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
            const pending = imgs.filter(img => !img.complete || img.naturalWidth === 0);

            if (pending.length === 0) {
                doAfterImagesLoad();
            } else {
                let done = 0;
                const onDone = () => { done++; if (done >= pending.length) doAfterImagesLoad(); };
                pending.forEach(img => {
                    img.addEventListener('load', onDone, { once: true });
                    img.addEventListener('error', onDone, { once: true });
                });
                setTimeout(() => { if (!cancelled) doAfterImagesLoad(); }, 3000);
            }
        }, 150);

        return () => { cancelled = true; clearTimeout(t); };
    }, [printing]);

    const handlePrint = () => {
        if (selected.size === 0) { setMessage({ type: 'danger', text: 'Select at least one voucher to print.' }); return; }
        setPendingSlipIds(allSlipIds);
        setPrinting(true);
    };

    const markAsPrinted = async () => {
        setMarkingPrinted(true);
        try {
            const r = await fetch(`${API}/fee-slips/mark-printed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slip_ids: pendingSlipIds }) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setMessage({ type: 'success', text: `Marked ${pendingSlipIds.length} slip(s) as printed.` });
            setShowConfirm(false); setSelected(new Set()); loadQueue();
        } catch (err: any) { setMessage({ type: 'danger', text: err.message }); }
        finally { setMarkingPrinted(false); }
    };

    const printStyles = `
        @page {
            size: A4 portrait;
            margin: 0;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm;
            height: 297mm;
            font-family: 'Times New Roman', Times, serif;
            color: #000;
            background: #fff;
        }
        body {
            padding: 5mm 6mm !important;
        }

        @media print {
            .sl-sidebar, .sl-topbar, .sl-overlay, .sl-toggle, .no-print { display: none !important; }
            .sl-layout { display: block !important; overflow: visible !important; height: auto !important; }
            .sl-main { margin-left: 0 !important; padding: 0 !important; width: 210mm !important; max-width: 210mm !important; overflow: visible !important; max-height: unset !important; height: auto !important; min-height: 0 !important; }
            body, html { margin: 0 !important; padding: 5mm 6mm !important; width: 210mm !important; height: 297mm !important; background: #fff !important; overflow: visible !important; font-family: 'Times New Roman', Times, serif; color: #000; }
            .page-container {
                page-break-after: always;
                break-after: page;
            }
            .page-container:last-child {
                page-break-after: auto;
                break-after: auto;
            }
        }

        /* Outer wrapper for 4 vouchers on A4 Portrait page */
        .page-container {
            position: relative;
            width: 198mm;
            height: 287mm;
            display: grid;
            grid-template-columns: 96mm 96mm;
            grid-template-rows: 138mm 138mm;
            gap: 11mm 6mm;
            box-sizing: border-box;
            margin: 0 auto;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        /* Cut separators between 4 vouchers */
        .cut-line-v {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 99mm;
            width: 0;
            border-left: 1.2pt dashed #555;
            transform: translateX(-50%);
            pointer-events: none;
        }
        .cut-line-v::before {
            content: "\\2702";
            position: absolute;
            top: -3.5mm;
            left: 50%;
            transform: translateX(-50%) rotate(90deg);
            font-size: 8pt;
            color: #555;
            background: #fff;
            padding: 0 0.5mm;
        }
        .cut-line-v::after {
            content: "\\2702";
            position: absolute;
            bottom: -3.5mm;
            left: 50%;
            transform: translateX(-50%) rotate(90deg);
            font-size: 8pt;
            color: #555;
            background: #fff;
            padding: 0 0.5mm;
        }

        .cut-line-h {
            position: absolute;
            left: 0;
            right: 0;
            top: 143.5mm;
            height: 0;
            border-top: 1.2pt dashed #555;
            transform: translateY(-50%);
            pointer-events: none;
        }
        .cut-line-h::before {
            content: "\\2702";
            position: absolute;
            left: -4mm;
            top: 50%;
            transform: translateY(-50%);
            font-size: 8pt;
            color: #555;
            background: #fff;
            padding: 0.5mm 0;
        }
        .cut-line-h::after {
            content: "\\2702";
            position: absolute;
            right: -4mm;
            top: 50%;
            transform: translateY(-50%) rotate(180deg);
            font-size: 8pt;
            color: #555;
            background: #fff;
            padding: 0.5mm 0;
        }

        /* Fixed Voucher card frame */
        .voucher {
            width: 96mm;
            height: 138mm;
            border: 1.5pt solid #000;
            outline: 0.5pt solid #000;
            outline-offset: 1.2pt;
            padding: 2.5mm 3mm 1.5mm 3mm;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: hidden;
            background: #fff;
            color: #000;
            font-family: 'Times New Roman', Times, serif;
        }

        .voucher-header {
            display: flex;
            align-items: center;
            gap: 2mm;
            flex: 0 0 auto;
        }
        .logo-placeholder {
            width: 14mm;
            height: 12mm;
            flex: 0 0 auto;
            border: none;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .logo-placeholder img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }
        .school-name {
            flex: 1 1 auto;
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            line-height: 1.15;
            text-align: left;
        }
        .school-address, .school-contact {
            font-size: 8.5pt;
            text-align: center;
            width: 100%;
            flex: 0 0 auto;
            line-height: 1.15;
        }
        .school-address { margin-top: 0.4mm; }
        .school-contact { margin-top: 0.2mm; white-space: nowrap; }

        .divider {
            width: 100%;
            border-top: 0.9pt solid #000;
            margin: 0.5mm 0;
            flex: 0 0 auto;
        }

        .voucher-type {
            font-size: 10.5pt;
            font-weight: bold;
            text-transform: uppercase;
            text-align: center;
            margin: 0.2mm 0;
            flex: 0 0 auto;
        }

        .voucher-details, .voucher-date-line {
            font-size: 8.8pt;
            white-space: nowrap;
            display: flex;
            justify-content: space-between;
            flex: 0 0 auto;
        }
        .voucher-details { margin-top: 0.4mm; }
        .voucher-date-line { margin-top: 0.2mm; }

        .voucher-details span.number,
        .voucher-details span.family-id,
        .voucher-date-line span.date-value {
            font-size: 9pt;
            font-weight: bold;
            text-decoration: underline;
        }

        /* Voucher body layout */
        .voucher-body {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .student-details, .fee-desc {
            font-size: 9pt;
            font-weight: bold;
            margin-top: 0.8mm;
            border-bottom: 0.8pt solid #000;
            padding-bottom: 0.2mm;
            flex: 0 0 auto;
        }

        .students-table, .fee-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.4mm;
            font-size: 8.5pt;
            table-layout: fixed;
            flex: 0 0 auto;
        }
        .students-table th, .students-table td,
        .fee-table th, .fee-table td {
            border: 1px solid #000;
            padding: 0.35mm 0.7mm;
            line-height: 1.15;
            height: 4mm;
            word-wrap: break-word;
            box-sizing: border-box;
            overflow: hidden;
        }
        .students-table th, .fee-table th {
            font-weight: bold;
            background-color: #eee;
        }

        .students-table th:nth-child(1), .students-table td:nth-child(1) { width: 38%; text-align: left; }
        .students-table th:nth-child(2), .students-table td:nth-child(2) { width: 38%; text-align: left; }
        .students-table th:nth-child(3), .students-table td:nth-child(3) { width: 24%; text-align: center; }

        .fee-table th:nth-child(1), .fee-table td:nth-child(1) { width: 12%; text-align: center; }
        .fee-table th:nth-child(2), .fee-table td:nth-child(2) { width: 58%; text-align: left; }
        .fee-table th:nth-child(3), .fee-table td:nth-child(3) { width: 30%; text-align: center; }
        .fee-table .total-row td {
            font-weight: bold;
            background-color: #eee;
            border-top: 1.2pt solid #000;
        }

        /* Rules & Software Instructions Section directly after Fee Table */
        .rules-section {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            padding-top: 0.6mm;
            margin-top: 0.8mm;
            border-top: 0.8pt dashed #000;
            min-height: 0;
        }
        .rules-box {
            font-size: 7.2pt;
            line-height: 1.25;
            margin-bottom: 0.6mm;
            flex: 0 0 auto;
        }
        .rules-box .rule-line {
            display: block;
        }
        .software-instructions {
            flex: 1 1 auto;
            background: #f4f4f4;
            border: 0.6pt solid #777;
            border-radius: 0.5mm;
            padding: 0.6mm 0.8mm;
            font-size: 7pt;
            line-height: 1.25;
            overflow: hidden;
        }
        .software-instructions .instructions-label {
            font-weight: bold;
            text-decoration: underline;
            display: block;
            margin-bottom: 0.3mm;
        }

        /* Developer credit line */
        .developer-credit {
            text-align: center;
            font-size: 6.5pt;
            font-style: italic;
            margin-top: 0.6mm;
            color: #333;
            flex: 0 0 auto;
        }
    `;

    // ── Print layout (replaces entire page content while printing) ──────────
    if (printing) {
        return (
            <>
                <style>{printStyles}</style>
                <div style={{ fontFamily: '"Times New Roman", Times, serif', margin: 0, padding: '5mm 6mm', background: '#fff', width: '210mm' }}>
                    {pages.map((page, pi) => (
                        <div key={pi} className="page-container" style={{
                            pageBreakAfter: pi < pages.length - 1 ? 'always' : 'auto',
                            breakAfter: pi < pages.length - 1 ? 'page' : 'auto',
                        }}>
                            {page.map((v, vi) => (
                                <VoucherSlip key={vi} v={v} serial={getSerial(v)} month={month} year={year} school={school} filterClassId={classId || undefined} />
                            ))}
                            {page.length < 4 && Array.from({ length: 4 - page.length }).map((_, ei) => (
                                <div key={`empty-${ei}`} style={{ width: '96mm', height: '138mm', visibility: 'hidden' }} />
                            ))}
                            <div className="cut-line-v" />
                            <div className="cut-line-h" />
                        </div>
                    ))}
                </div>
            </>
        );
    }
    // ────────────────────────────────────────────────────────────────────────

    return (
        <>
            <style>{printStyles}</style>
            {school.school_logo_url && (
                <img src={school.school_logo_url} alt="" aria-hidden="true"
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
            )}
            {/* Screen UI */}
            <div className="container-fluid p-4 animate__animated animate__fadeIn">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center align-items-start gap-3 mb-4">
                    <div>
                        <h2 className="fw-bold mb-1 d-flex align-items-center flex-wrap gap-2" style={{ color: 'var(--primary-dark)' }}>
                            <i className="bi bi-printer me-1"></i>Print Fee Slips
                            <span className="badge rounded-pill bg-light text-dark border ms-2" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                Academic Year: {activeYear?.year_name || '—'}
                            </span>
                        </h2>
                        <p className="text-muted small mb-0">4 family vouchers per A4 portrait page. Sibling fees combined into one voucher. Print tracking enabled.</p>
                    </div>
                </div>

                {message && (
                    <div className={`alert alert-${message.type} d-flex align-items-center animate__animated animate__fadeIn`}>
                        <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>
                        <span>{message.text}</span>
                        <button className="btn-close ms-auto" onClick={() => setMessage(null)}></button>
                    </div>
                )}

                <div className="card border-0 shadow-sm mb-4">
                    <div className="card-body p-3">
                        <div className="row g-3 align-items-end">
                            <div className="col-md-3">
                                <label className="form-label fw-bold small text-muted">Month</label>
                                <select className="form-select" value={month} onChange={e => setMonth(e.target.value)}>
                                    {availableMonths.length === 0 ? (
                                        <option value="">No Fees Generated</option>
                                    ) : (
                                        availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                                    )}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold small text-muted">Year</label>
                                <input
                                    type="text"
                                    className="form-control bg-light text-dark fw-semibold"
                                    value={activeYear?.year_name || year}
                                    readOnly
                                    disabled
                                    style={{ cursor: 'not-allowed' }}
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold small text-muted">Class Filter (optional)</label>
                                <select className="form-select" value={classId} onChange={e => setClassId(e.target.value)}>
                                    <option value="">All Classes</option>
                                    {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <button className="btn btn-primary-custom w-100 py-2 fw-bold" onClick={loadQueue} disabled={loading}>
                                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Loading...</> : <><i className="bi bi-search me-2"></i>Load Queue</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {stats && (
                    <div className="row g-3 mb-4">
                        {[
                            { label: 'Total Vouchers', value: stats.total_vouchers, color: 'var(--primary-dark)' },
                            { label: 'Pending Print', value: stats.pending, color: '#dc3545' },
                            { label: 'Printed', value: stats.printed, color: '#198754' },
                            { label: 'Family Vouchers', value: stats.family_vouchers, color: '#215E61' },
                        ].map((s, i) => (
                            <div className="col-6 col-md-3" key={i}>
                                <div className="card border-0 shadow-sm" style={{ borderLeft: `4px solid ${s.color}` }}>
                                    <div className="card-body py-2 px-3">
                                        <div className="text-muted small fw-bold text-uppercase">{s.label}</div>
                                        <div className="fw-bold" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {vouchers.length > 0 && (
                    <div className="row g-4">
                        <div className="col-lg-8">
                            <div className="card border-0 shadow-sm mb-3">
                                <div className="card-body py-2 px-3 d-flex flex-wrap gap-2 align-items-center">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={selectAllPending}>
                                        Select Pending ({vouchers.filter(v => !v.is_printed).length})
                                    </button>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={selectAll}>All</button>
                                    <button className="btn btn-sm btn-outline-secondary" onClick={clearAll}>Clear</button>
                                    <span className="text-muted small ms-1">{selected.size} selected · {pages.length} page(s)</span>
                                    <button className="btn btn-primary-custom fw-bold px-4 ms-auto" onClick={handlePrint} disabled={selected.size === 0}>
                                        <i className="bi bi-printer me-2"></i>Print {selected.size} Voucher(s)
                                    </button>
                                </div>
                            </div>
                            {vouchers.map((v, i) => <VoucherCard key={i} v={v} idx={i} selected={selected.has(i)} onToggle={() => toggleSelect(i)} filterClassId={classId || undefined} />)}
                        </div>
                        <div className="col-lg-4">
                            <div className="card border-0 shadow-sm mb-3">
                                <div className="card-header bg-white border-bottom py-2" style={{ borderLeft: '4px solid var(--primary-teal)' }}>
                                    <h6 className="mb-0 fw-bold small" style={{ color: 'var(--primary-dark)' }}><i className="bi bi-info-circle me-2"></i>Voucher Rules</h6>
                                </div>
                                <div className="card-body p-3 small text-muted">
                                    <ul className="list-unstyled mb-0">
                                        <li className="mb-2"><i className="bi bi-grid-fill text-primary me-2"></i>4 vouchers per A4 portrait page (2x2)</li>
                                        <li className="mb-2"><i className="bi bi-people-fill me-2" style={{ color: '#215E61' }}></i>Siblings → ONE combined family voucher</li>
                                        <li className="mb-2"><i className="bi bi-sort-up me-2"></i>Priority = highest class sibling</li>
                                        <li className="mb-2"><i className="bi bi-printer-fill text-success me-2"></i>Print marks ALL siblings as printed</li>
                                        <li><code className="small">FEB000001</code> = Month + 6-digit serial</li>
                                    </ul>
                                </div>
                            </div>
                            {coveredStudents.length > 0 && (
                                <div className="card border-0 shadow-sm">
                                    <div className="card-header bg-warning bg-opacity-10 border-bottom py-2">
                                        <h6 className="mb-0 fw-bold small text-warning"><i className="bi bi-arrow-right-circle me-2"></i>In Sibling Voucher ({coveredStudents.length})</h6>
                                    </div>
                                    <div className="card-body p-3">
                                        {coveredStudents.map((s, i) => (
                                            <div key={i} className="border rounded p-2 mb-2 bg-light small">
                                                <div className="fw-bold">{s.first_name} {s.last_name}</div>
                                                <div className="text-muted" style={{ fontSize: '0.72rem' }}>{s.class_name} · {s.admission_no}</div>
                                                <div className="text-muted" style={{ fontSize: '0.72rem' }}>Included in: <b>{s.covered_by?.first_name} {s.covered_by?.last_name}</b></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!loading && vouchers.length === 0 && stats !== null && (
                    <div className="card border-0 shadow-sm text-center py-5">
                        <i className="bi bi-inbox fs-1 text-muted d-block mb-3"></i>
                        <p className="text-muted">No slips found. Generate slips first from Generate Slips page.</p>
                    </div>
                )}
            </div>

            {showConfirm && (
                <>
                    <div className="modal-backdrop fade show no-print" style={{ zIndex: 1040 }}></div>
                    <div className="modal fade show d-block no-print" style={{ zIndex: 1050 }}>
                        <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content border-0 shadow-lg">
                                <div className="modal-header text-white" style={{ backgroundColor: 'var(--primary-dark)' }}>
                                    <h5 className="modal-title"><i className="bi bi-printer me-2"></i>Printing Complete?</h5>
                                    <button className="btn-close btn-close-white" onClick={() => setShowConfirm(false)}></button>
                                </div>
                                <div className="modal-body p-4">
                                    <p className="mb-2">Did <strong>{selectedVouchers.length} voucher(s)</strong> print successfully?</p>
                                    <p className="text-muted small">Marking as printed prevents duplicate vouchers from being issued.</p>
                                    <div className="alert alert-info py-2 small mb-0">
                                        <i className="bi bi-info-circle me-1"></i>
                                        {selectedVouchers.filter(v => v.voucher_type === 'family').length} family voucher(s) all siblings marked together.
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-secondary-custom" onClick={() => setShowConfirm(false)}>No Print Again</button>
                                    <button className="btn btn-primary-custom fw-bold px-4" onClick={markAsPrinted} disabled={markingPrinted}>
                                        {markingPrinted ? <><span className="spinner-border spinner-border-sm me-2"></span>Marking...</> : <><i className="bi bi-check-circle me-2"></i>Yes, Mark as Printed</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
