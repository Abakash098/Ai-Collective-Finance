import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, TextField, Button, Paper, InputAdornment, 
  Alert, Grid, CircularProgress, Switch, FormControlLabel, 
  Select, MenuItem, InputLabel, FormControl, Divider, Avatar, Chip,
  Tooltip, IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { 
  CheckCircle, Cancel, Person, AccountBalance, Engineering, Palette, 
  AutoAwesome, PlayForWork, VerifiedUser, HelpOutline, TaskAlt
} from '@mui/icons-material';

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Other'
];

const OUR_COMPANY_STATE = 'Maharashtra'; 

const VERIFIERS = [
  { id: 'rup',     name: 'Rup',     title: 'Tech Head',           icon: <Engineering />, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'debojit', name: 'Debojit', title: 'Creative Head & Owner', icon: <Person />,    color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { id: 'yash',    name: 'Yash',    title: 'Finance Head',        icon: <AccountBalance />, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  { id: 'samaja',  name: 'Samaja',  title: 'Content Head',        icon: <Palette />,    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
];

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// ── Field Verification Badge Component ──
const FieldVerifyBadge = ({ fieldKey, verifications, onVerify }) => {
  const status = verifications[fieldKey];
  if (status === undefined) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
      <Tooltip title="Confirm this value is correct">
        <IconButton 
          size="small" 
          onClick={() => onVerify(fieldKey, true)}
          sx={{ 
            color: status === true ? '#10b981' : 'rgba(255,255,255,0.3)', 
            p: 0.4,
            bgcolor: status === true ? 'rgba(16,185,129,0.12)' : 'transparent',
            border: status === true ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1,
            transition: 'all 0.2s'
          }}
        >
          <TaskAlt sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Mark as incorrect or uncertain">
        <IconButton 
          size="small" 
          onClick={() => onVerify(fieldKey, false)}
          sx={{ 
            color: status === false ? '#ef4444' : 'rgba(255,255,255,0.3)', 
            p: 0.4,
            bgcolor: status === false ? 'rgba(239,68,68,0.12)' : 'transparent',
            border: status === false ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1,
            transition: 'all 0.2s'
          }}
        >
          <Cancel sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {status === true && (
        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 600, fontSize: 10 }}>Verified ✓</Typography>
      )}
      {status === false && (
        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600, fontSize: 10 }}>Please correct ✗</Typography>
      )}
    </Box>
  );
};

const SubmitRequest = () => {
  // OCR Scan States
  const [ocrData, setOcrData] = useState(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrApplied, setOcrApplied] = useState(false);

  // Per-field verification (null = not shown, true = verified, false = flagged incorrect)
  const [verifications, setVerifications] = useState({});

  // Verifier Selection
  const [selectedVerifier, setSelectedVerifier] = useState('');

  // Vendor Fields
  const [vendorName, setVendorName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Project Fields
  const [projectName, setProjectName] = useState('');
  const [department, setDepartment] = useState('');
  const [projectHead, setProjectHead] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Financial Fields
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [isGst, setIsGst] = useState(false);
  const [gstNumber, setGstNumber] = useState('');
  const [gstPercentage, setGstPercentage] = useState(18);

  // Derived Financials
  const [gstAmount, setGstAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [gstType, setGstType] = useState('N/A');

  // Request Meta
  const [purpose, setPurpose] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();
  const { apiFetch } = useApi();

  // Dynamic GST Calculation Logic
  useEffect(() => {
    const base = parseFloat(baseAmount) || 0;
    if (isGst) {
      const gAmt = (base * gstPercentage) / 100;
      setGstAmount(gAmt);
      setTotalAmount(base + gAmt);
      if (state === OUR_COMPANY_STATE) {
        setGstType(`CGST (${gstPercentage/2}%) & SGST (${gstPercentage/2}%)`);
      } else if (state) {
        setGstType(`IGST (${gstPercentage}%)`);
      } else {
        setGstType('Select State for GST breakdown');
      }
    } else {
      setGstAmount(0);
      setTotalAmount(base);
      setGstType('N/A');
    }
  }, [baseAmount, isGst, gstPercentage, state]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadMessage('Uploading and analyzing invoice with AI...');
    setOcrScanning(true);
    setOcrData(null);
    setOcrApplied(false);
    setVerifications({});
    const formData = new FormData();
    formData.append('invoice', file);
    
    try {
      const res = await apiFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage('✅ Invoice uploaded and analyzed successfully!');
        setOcrData({
          extracted_amount: data.extracted_amount,
          vendor_name: data.vendor_name,
          invoice_date: data.invoice_date,
          gst_number: data.gst_number,
          purpose: data.purpose,
          ocr_confidence: data.ocr_confidence,
          ocr_engine: data.ocr_engine
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setUploadMessage(`❌ Failed to upload invoice. ${errData.error || ''}`);
      }
    } catch (err) {
      setUploadMessage('❌ Network error uploading invoice.');
    } finally {
      setOcrScanning(false);
    }
  };

  const applyOcrToForm = () => {
    if (!ocrData) return;
    const newVerifications = {};
    
    if (ocrData.vendor_name && !ocrData.vendor_name.includes('OCR Failed') && ocrData.vendor_name !== 'Unknown Vendor') {
      setVendorName(ocrData.vendor_name);
      setCompanyName(ocrData.vendor_name);
      newVerifications['vendorName'] = null;
      newVerifications['companyName'] = null;
    }
    if (ocrData.extracted_amount && ocrData.extracted_amount > 0) {
      setBaseAmount(ocrData.extracted_amount.toString());
      newVerifications['baseAmount'] = null;
    }
    if (ocrData.gst_number) {
      setGstNumber(ocrData.gst_number);
      setIsGst(true);
      newVerifications['gstNumber'] = null;
    }
    if (ocrData.purpose && !ocrData.purpose.includes('OCR Failed')) {
      setPurpose(ocrData.purpose);
      newVerifications['purpose'] = null;
    }
    if (ocrData.invoice_date) {
      setStartDate(ocrData.invoice_date);
      newVerifications['startDate'] = null;
    }

    // Set verifications to null (showing buttons but no status yet)
    setVerifications(newVerifications);
    setOcrApplied(true);
  };

  const handleVerify = (fieldKey, isCorrect) => {
    setVerifications(prev => ({ ...prev, [fieldKey]: isCorrect }));
  };

  // FLEXIBLE SUBMIT — only name, location (city), and amount are mandatory
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const missingFields = [];
    if (!vendorName.trim()) missingFields.push('Vendor Name');
    if (!city.trim()) missingFields.push('City / Location');
    if (!baseAmount || parseFloat(baseAmount) <= 0) missingFields.push('Invoice Amount');

    if (missingFields.length > 0) {
      setError(`Please fill in the required fields: ${missingFields.join(', ')}.`);
      return;
    }
    if (!selectedVerifier) {
      setError('Please select a first-line verifier from the team.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const metadata = JSON.stringify({
        vendorName, companyName, phone, city, state,
        projectName, department, projectHead, startDate, endDate,
        advanceAmount: parseFloat(advanceAmount) || 0,
        baseAmount: parseFloat(baseAmount) || 0,
        isGst, gstNumber, gstPercentage, gstAmount, totalAmount, gstType,
        fileHash,
        fieldVerifications: verifications  // Save verification status
      });

      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: totalAmount || parseFloat(baseAmount),
          purpose: purpose || `Invoice from ${vendorName || 'Vendor'} — ₹${baseAmount}`,
          metadata,
          file_hash: fileHash,
          verifier: selectedVerifier
        })
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/'), 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit request.');
      }
    } catch {
      setError('Network error. Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  // Count verified vs flagged fields
  const verifiedCount = Object.values(verifications).filter(v => v === true).length;
  const flaggedCount = Object.values(verifications).filter(v => v === false).length;
  const pendingCount = Object.values(verifications).filter(v => v === null).length;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', mt: 2, mb: 10 }}>
      <Typography variant="h4" mb={0.5} fontWeight={700}>Vendor & Project Disbursement Form</Typography>
      <Typography variant="body1" color="text.secondary" mb={1}>
        Initialize a secure financial request. <strong style={{ color: '#f59e0b' }}>★ Only Vendor Name, Location & Amount are required</strong> — all other fields are optional.
      </Typography>
      
      {/* ── WORKFLOW DIAGRAM BANNER ── */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3, background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <Typography variant="subtitle2" color="primary" mb={2} sx={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
          📋 Approval Workflow
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {[
            { label: 'Vendor Submits', color: '#6366f1', icon: '🏪' },
            { label: '▶', color: 'text.disabled', arrow: true },
            { label: 'First-Line Verifier', color: '#f59e0b', icon: '👁️' },
            { label: '▶', color: 'text.disabled', arrow: true },
            { label: 'Finance (Yash)', color: '#22c55e', icon: '💼' },
            { label: '▶', color: 'text.disabled', arrow: true },
            { label: 'Owner (Debojit)', color: '#8b5cf6', icon: '👑' },
            { label: '▶', color: 'text.disabled', arrow: true },
            { label: 'Payment ✅', color: '#22c55e', icon: '' },
          ].map((step, i) => 
            step.arrow ? (
              <Typography key={i} sx={{ color: 'text.disabled', fontSize: 18, fontWeight: 700 }}>→</Typography>
            ) : (
              <Chip key={i} label={`${step.icon} ${step.label}`} size="small"
                sx={{ bgcolor: `${step.color}22`, color: step.color, border: `1px solid ${step.color}44`, fontWeight: 600 }} />
            )
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
          Choose a first-line verifier below. Rup (Tech), Debojit (Creative/Owner), Yash (Finance), or Samaja (Content) will perform the initial review.
        </Typography>
      </Paper>

      <Paper sx={{ p: 4, borderRadius: 2 }}>
        {success && <Alert severity="success" sx={{ mb: 3 }}>Request submitted successfully! Redirecting to Dashboard...</Alert>}
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          
          {/* ── STEP 1: UPLOAD INVOICE ── */}
          <Typography variant="h6" color="primary" mb={1}>1. Upload Vendor Invoice (AI OCR)</Typography>
          <Box sx={{ mb: 4, p: 3, border: '1px dashed rgba(99,102,241,0.5)', borderRadius: 2, bgcolor: 'rgba(99,102,241,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              {!fileHash ? (
                <Button variant="outlined" component="label" sx={{ mr: 2, background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', borderColor: 'primary.main' }} disabled={ocrScanning}>
                  📁 Upload Image/PDF
                  <input type="file" hidden accept="image/*,application/pdf,.webp,.heic,.heif" onChange={handleFileUpload} />
                </Button>
              ) : (
                <Button variant="outlined" color="error" onClick={() => { setFileHash(''); setUploadMessage(''); setBaseAmount(''); setOcrData(null); setOcrApplied(false); setVerifications({}); }} disabled={ocrScanning}>
                  ❌ Remove & Change Invoice
                </Button>
              )}
              {uploadMessage && <Typography variant="body2" sx={{ display: 'inline-block', color: uploadMessage.startsWith('✅') ? 'success.main' : uploadMessage.startsWith('❌') ? 'error.main' : 'text.secondary' }}>{uploadMessage}</Typography>}
              {fileHash && <Chip label="Document Attached" size="small" color="success" />}
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              Supports: JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, PDF — Max 10MB
            </Typography>

            {ocrScanning && (
              <Paper sx={{ p: 3, mt: 2, display: 'flex', alignItems: 'center', gap: 3, borderRadius: 2, border: '1px solid rgba(99,102,241,0.2)', background: 'linear-gradient(135deg, rgba(99,102,241,0.03) 0%, rgba(139,92,246,0.03) 100%)' }}>
                <CircularProgress size={30} thickness={5} sx={{ color: '#6366f1' }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoAwesome sx={{ color: '#8b5cf6', fontSize: 18 }} /> High-Class AI OCR Scanning Active
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Extracting vendor name, base amount, tax breakdowns, and handwriting...
                  </Typography>
                </Box>
              </Paper>
            )}

            {fileHash && !ocrScanning && (
              <Grid container spacing={3} mt={0.5}>
                {/* Left side: Preview */}
                <Grid item xs={12} md={5}>
                  <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <Typography variant="caption" sx={{ p: 1, display: 'block', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.02)' }}>
                      📄 Uploaded Invoice Preview
                    </Typography>
                    <Box sx={{ p: 1.5, backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                      {fileHash.toLowerCase().endsWith('.pdf') ? (
                        <Box>
                          <iframe src={`${API_BASE_URL}/uploads/${fileHash}`} title="Invoice PDF Preview" width="100%" height="200px" style={{ border: 'none', backgroundColor: '#fff', borderRadius: 4 }} />
                          <Button variant="outlined" size="small" component="a" href={`${API_BASE_URL}/uploads/${fileHash}`} target="_blank" rel="noopener noreferrer" sx={{ mt: 1 }}>
                            📂 Open PDF in New Tab
                          </Button>
                        </Box>
                      ) : (
                        <img 
                          src={`${API_BASE_URL}/uploads/${fileHash}`} 
                          alt="Invoice Preview"
                          style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, display: 'inline-block' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                    </Box>
                  </Box>
                </Grid>

                {/* Right side: OCR Results Panel */}
                {ocrData && (
                  <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(99,102,241,0.25)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)', position: 'relative', overflow: 'hidden' }}>
                      <style>{`
                        @keyframes scan-line { 0% { top: 0%; } 50% { top: 100%; } 100% { top: 0%; } }
                      `}</style>
                      <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)', animation: 'scan-line 3s infinite linear' }} />
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AutoAwesome /> Auto-Detected Invoice Data
                        </Typography>
                        <Chip 
                          label={ocrData.ocr_engine} 
                          size="small" 
                          sx={{ 
                            background: ocrData.ocr_engine?.includes('Gemini') 
                              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' 
                              : 'rgba(255,255,255,0.08)',
                            color: 'white', fontWeight: 700, fontSize: 10
                          }} 
                        />
                      </Box>

                      <Grid container spacing={2} mb={2.5}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">🏢 Vendor Name</Typography>
                          <Typography variant="body2" fontWeight={600} noWrap>{ocrData.vendor_name || 'Not detected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">💰 Amount (Base)</Typography>
                          <Typography variant="body2" fontWeight={600} sx={{ color: 'success.main' }}>
                            ₹{ocrData.extracted_amount ? ocrData.extracted_amount.toLocaleString('en-IN') : '0.00'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">📅 Invoice Date</Typography>
                          <Typography variant="body2" fontWeight={600}>{ocrData.invoice_date || 'Not detected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">🔢 GST Number</Typography>
                          <Typography variant="body2" fontWeight={600} sx={{ color: ocrData.gst_number ? 'primary.light' : 'text.disabled' }}>
                            {ocrData.gst_number || 'No GST found'}
                          </Typography>
                        </Grid>
                      </Grid>

                      {/* Confidence Score */}
                      <Box sx={{ mb: 2.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">OCR Scan Confidence</Typography>
                          <Typography variant="caption" fontWeight={700} sx={{ color: ocrData.ocr_confidence >= 80 ? 'success.main' : ocrData.ocr_confidence >= 50 ? 'warning.main' : 'error.main' }}>
                            {ocrData.ocr_confidence}%
                          </Typography>
                        </Box>
                        <Box sx={{ width: '100%', height: 6, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <Box sx={{ 
                            width: `${ocrData.ocr_confidence}%`, height: '100%', borderRadius: 3,
                            background: ocrData.ocr_confidence >= 80 
                              ? 'linear-gradient(90deg, #10b981, #059669)' 
                              : ocrData.ocr_confidence >= 50 
                                ? 'linear-gradient(90deg, #f59e0b, #d97706)' 
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                            transition: 'width 1s ease-out'
                          }} />
                        </Box>
                      </Box>

                      <Button 
                        variant="contained" fullWidth onClick={applyOcrToForm}
                        startIcon={<PlayForWork />}
                        sx={{ py: 1, background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700, '&:hover': { background: 'linear-gradient(135deg, #059669, #047857)' } }}
                      >
                        ✨ Auto-fill Disbursement Form
                      </Button>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            )}
          </Box>

          {/* ── OCR VERIFICATION STATUS BAR ── */}
          {ocrApplied && Object.keys(verifications).length > 0 && (
            <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <VerifiedUser sx={{ color: '#6366f1' }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={700} sx={{ color: 'primary.main' }}>
                  🔍 Second-Line Vendor Verification Active
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Review each auto-filled field below — click ✓ to confirm accuracy or ✗ to flag for correction.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {verifiedCount > 0 && <Chip label={`✓ ${verifiedCount} Confirmed`} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700, border: '1px solid rgba(16,185,129,0.3)' }} />}
                {flaggedCount > 0 && <Chip label={`✗ ${flaggedCount} Flagged`} size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }} />}
                {pendingCount > 0 && <Chip label={`? ${pendingCount} Pending`} size="small" sx={{ bgcolor: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }} />}
              </Box>
            </Paper>
          )}

          {/* ── STEP 2: VERIFIER SELECTION ── */}
          <Typography variant="h6" color="primary" mb={1}>2. Select First-Line Verifier</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Choose who will perform the first review of this request before it goes to Finance.
          </Typography>
          <Grid container spacing={2} mb={4}>
            {VERIFIERS.map((v) => (
              <Grid item xs={12} sm={6} md={3} key={v.id}>
                <Paper
                  onClick={() => setSelectedVerifier(v.id)}
                  elevation={selectedVerifier === v.id ? 6 : 1}
                  sx={{
                    p: 2.5, borderRadius: 3, cursor: 'pointer', textAlign: 'center',
                    border: selectedVerifier === v.id ? `2px solid ${v.color}` : '2px solid transparent',
                    background: selectedVerifier === v.id ? v.bg : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s ease', position: 'relative',
                    '&:hover': { background: v.bg, border: `2px solid ${v.color}66` }
                  }}
                >
                  {selectedVerifier === v.id && (
                    <CheckCircle sx={{ position: 'absolute', top: 8, right: 8, color: v.color, fontSize: 18 }} />
                  )}
                  <Avatar sx={{ bgcolor: v.color, width: 52, height: 52, mx: 'auto', mb: 1.5, fontSize: 22, fontWeight: 700 }}>
                    {v.name.charAt(0)}
                  </Avatar>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: selectedVerifier === v.id ? v.color : 'text.primary' }}>
                    {v.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{v.title}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ── STEP 3: VENDOR DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">3. Vendor Details</Typography>
            <Chip label="Name & Location Required ★" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, fontSize: 10, border: '1px solid rgba(245,158,11,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Vendor Name ★" value={vendorName} 
                onChange={(e) => setVendorName(e.target.value)} required
                helperText={verifications['vendorName'] === false ? '⚠ Please correct this value' : verifications['vendorName'] === true ? '✓ Confirmed by vendor' : ''}
                FormHelperTextProps={{ sx: { color: verifications['vendorName'] === false ? '#ef4444' : '#10b981' } }}
              />
              <FieldVerifyBadge fieldKey="vendorName" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Company Name" value={companyName} 
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <FieldVerifyBadge fieldKey="companyName" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone Number (Optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="City / Location ★" value={city} 
                onChange={(e) => setCity(e.target.value)} required 
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>State (Optional)</InputLabel>
                <Select value={state} label="State (Optional)" onChange={(e) => setState(e.target.value)}>
                  {STATES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ── STEP 4: PROJECT DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">4. Project Details</Typography>
            <Chip label="All Optional" size="small" sx={{ bgcolor: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 700, fontSize: 10, border: '1px solid rgba(99,102,241,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project Name (Optional)" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Department (Optional)" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project Head (Optional)" value={projectHead} onChange={(e) => setProjectHead(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="date" label="Start Date (Optional)" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <FieldVerifyBadge fieldKey="startDate" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="date" label="End Date (Optional)" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ── STEP 5: FINANCIAL DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">5. Financial & GST Details</Typography>
            <Chip label="Amount Required ★" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, fontSize: 10, border: '1px solid rgba(245,158,11,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Advance Amount (Optional)" type="number" value={advanceAmount} 
                onChange={(e) => setAdvanceAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Base Invoice Amount ★" type="number" value={baseAmount} 
                onChange={(e) => setBaseAmount(e.target.value)} required
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
              <FieldVerifyBadge fieldKey="baseAmount" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel 
                control={<Switch checked={isGst} onChange={(e) => setIsGst(e.target.checked)} color="primary" />} 
                label="Apply GST to this transaction" 
              />
            </Grid>
          </Grid>

          {isGst && (
            <Box sx={{ p: 3, mb: 3, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth label="GST Number" value={gstNumber} 
                    onChange={(e) => setGstNumber(e.target.value)} 
                  />
                  <FieldVerifyBadge fieldKey="gstNumber" verifications={verifications} onVerify={handleVerify} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>GST Rate (%)</InputLabel>
                    <Select value={gstPercentage} label="GST Rate (%)" onChange={(e) => setGstPercentage(e.target.value)}>
                      <MenuItem value={5}>5%</MenuItem>
                      <MenuItem value={12}>12%</MenuItem>
                      <MenuItem value={18}>18%</MenuItem>
                      <MenuItem value={28}>28%</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Calculated Tax Logic:</strong> {gstType}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* TOTALS DISPLAY */}
          <Box sx={{ p: 3, mb: 4, bgcolor: 'primary.dark', color: 'white', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>GST Amount: ₹{gstAmount.toFixed(2)}</Typography>
              <Typography variant="h5" fontWeight={700}>Total Amount: ₹{(totalAmount || parseFloat(baseAmount) || 0).toFixed(2)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
               <Typography variant="body2" sx={{ opacity: 0.8 }}>State: {state || 'Not specified'}</Typography>
               {selectedVerifier && (
                <Chip 
                  label={`Verifier: ${VERIFIERS.find(v=>v.id===selectedVerifier)?.name}`}
                  size="small"
                  sx={{ mt: 0.5, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
               )}
            </Box>
          </Box>

          {/* BUSINESS PURPOSE */}
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12}>
              <TextField 
                fullWidth label="Business Purpose / Remarks (Optional)" multiline rows={3}
                value={purpose} onChange={(e) => setPurpose(e.target.value)}
                placeholder="Auto-filled from invoice if available. Can be left blank."
              />
              <FieldVerifyBadge fieldKey="purpose" verifications={verifications} onVerify={handleVerify} />
            </Grid>
          </Grid>

          {/* VERIFIER SUMMARY */}
          {selectedVerifier && (
            <Box sx={{ mb: 3, p: 2.5, borderRadius: 2, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <CheckCircle sx={{ color: '#6366f1' }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Assigned to: {VERIFIERS.find(v=>v.id===selectedVerifier)?.name} ({VERIFIERS.find(v=>v.id===selectedVerifier)?.title})
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  After verification → Finance (Yash) → Owner (Debojit) → Payment
                </Typography>
              </Box>
            </Box>
          )}

          {/* REQUIRED FIELDS SUMMARY */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
              ★ MINIMUM REQUIRED TO SUBMIT:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip 
                label={`Vendor Name: ${vendorName || 'Missing'}`} size="small"
                sx={{ bgcolor: vendorName ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: vendorName ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`City: ${city || 'Missing'}`} size="small"
                sx={{ bgcolor: city ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: city ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`Amount: ${baseAmount ? `₹${parseFloat(baseAmount).toLocaleString('en-IN')}` : 'Missing'}`} size="small"
                sx={{ bgcolor: baseAmount ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: baseAmount ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`Verifier: ${selectedVerifier ? VERIFIERS.find(v=>v.id===selectedVerifier)?.name : 'Not selected'}`} size="small"
                sx={{ bgcolor: selectedVerifier ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: selectedVerifier ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
            </Box>
          </Paper>

          <Button 
            type="submit" variant="contained" color="primary" size="large" fullWidth
            disabled={loading || success} sx={{ py: 1.5, fontSize: '1.1rem' }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '🚀 Submit Disbursement Request'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
};

export default SubmitRequest;
