import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, TextField, Button, Paper, InputAdornment, 
  Alert, Grid, CircularProgress, Switch, FormControlLabel, 
  Select, MenuItem, InputLabel, FormControl, Divider, Avatar, Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { CheckCircle, Person, AccountBalance, Engineering, Palette } from '@mui/icons-material';

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Other'
];

// Base state to determine Intra-state (CGST/SGST) vs Inter-state (IGST)
const OUR_COMPANY_STATE = 'Maharashtra'; 

// The 4 first-line verifiers as per the workflow diagram
const VERIFIERS = [
  { id: 'rup',     name: 'Rup',     title: 'Tech Head',           icon: <Engineering />, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { id: 'debojit', name: 'Debojit', title: 'Creative Head & Owner', icon: <Person />,    color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { id: 'yash',    name: 'Yash',    title: 'Finance Head',        icon: <AccountBalance />, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  { id: 'samaja',  name: 'Samaja',  title: 'Content Head',        icon: <Palette />,    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
];

const SubmitRequest = () => {
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
        setBaseAmount(data.extracted_amount);
        setPurpose(data.purpose);
        setUploadMessage(`✅ AI extracted: ₹${data.extracted_amount}`);
      } else {
        setUploadMessage('❌ Failed to upload invoice.');
      }
    } catch (err) {
      setUploadMessage('❌ Network error uploading invoice.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!baseAmount || !purpose || !vendorName || !projectName || !state) {
      setError('Please fill in all required fields (including State).');
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
        fileHash
      });

      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: totalAmount || parseFloat(baseAmount),
          purpose,
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

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', mt: 2, mb: 10 }}>
      <Typography variant="h4" mb={0.5} fontWeight={700}>Vendor & Project Disbursement Form</Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>Initialize a secure financial request tied to a specific project and vendor.</Typography>
      
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
          Choose a first-line verifier below. Rup (Tech), Debojit (Creative/Owner), Yash (Finance), or Samaja (Content) will perform the initial review before the request proceeds to Finance → Owner → Payment.
        </Typography>
      </Paper>

      <Paper sx={{ p: 4, borderRadius: 2 }}>
        {success && <Alert severity="success" sx={{ mb: 3 }}>Request submitted successfully! Redirecting to Dashboard...</Alert>}
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          
          {/* ── STEP 1: UPLOAD INVOICE ── */}
          <Typography variant="h6" color="primary" mb={1}>1. Upload Vendor Invoice (AI OCR)</Typography>
          <Box sx={{ mb: 4, p: 3, border: '1px dashed rgba(99,102,241,0.5)', borderRadius: 2, bgcolor: 'rgba(99,102,241,0.05)' }}>
            <Button variant="outlined" component="label" sx={{ mr: 2 }}>
              Upload Image/PDF
              <input type="file" hidden accept="image/*,application/pdf" onChange={handleFileUpload} />
            </Button>
            {uploadMessage && <Typography variant="body2" sx={{ display: 'inline-block', color: 'text.secondary' }}>{uploadMessage}</Typography>}
            {fileHash && <Chip label="Document Attached" size="small" color="success" sx={{ ml: 2 }} />}
          </Box>

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
                    transition: 'all 0.2s ease',
                    position: 'relative',
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

          {/* VENDOR DETAILS */}
          <Typography variant="h6" color="primary" mb={2}>3. Vendor Details</Typography>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Vendor Name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>State</InputLabel>
                <Select value={state} label="State" onChange={(e) => setState(e.target.value)}>
                  {STATES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* PROJECT DETAILS */}
          <Typography variant="h6" color="primary" mb={2}>4. Project Details</Typography>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project Name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Project Head" value={projectHead} onChange={(e) => setProjectHead(e.target.value)} required />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="date" label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="date" label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* FINANCIAL DETAILS */}
          <Typography variant="h6" color="primary" mb={2}>5. Financial & GST Details</Typography>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Advance Amount" type="number" value={advanceAmount} 
                onChange={(e) => setAdvanceAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Base Invoice Amount" type="number" value={baseAmount} 
                onChange={(e) => setBaseAmount(e.target.value)} required
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
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
                  <TextField fullWidth label="GST Number" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} required={isGst} />
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
               <Typography variant="body2" sx={{ opacity: 0.8 }}>State: {state || 'Unselected'}</Typography>
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
                fullWidth label="General Business Purpose / Remarks" multiline rows={3}
                value={purpose} onChange={(e) => setPurpose(e.target.value)} required
              />
            </Grid>
          </Grid>

          {/* SUMMARY if verifier selected */}
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
