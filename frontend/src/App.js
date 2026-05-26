import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem } from '@mui/material';
import { SignedIn, SignedOut, SignIn, SignOutButton } from '@clerk/clerk-react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import SubmitRequest from './pages/SubmitRequest';
import SubscriptionTracker from './pages/SubscriptionTracker';
import EmployeeDashboard from './pages/EmployeeDashboard';
import FinanceReview from './pages/FinanceReview';
import WorksheetForm from './pages/WorksheetForm';
import WorksheetAdmin from './pages/WorksheetAdmin';
import { TechDashboard, ContentDashboard } from './pages/VerifierDashboard';
import AuthSync from './components/AuthSync';
import { useSelector, useDispatch } from 'react-redux';
import { setRole } from './store/authSlice';
import { useApi } from './hooks/useApi';

function App() {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const { apiFetch } = useApi();

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const changeRoleLocal = async (newRole, name = null) => {
    try {
      const res = await apiFetch('/api/me/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, name })
      });
      if (res.ok) {
        dispatch(setRole(newRole));
        window.location.reload();
      } else {
        console.error('Failed to change role on backend');
      }
    } catch (e) {
      console.error(e);
    }
    handleClose();
  };
  return (
    <>
      <SignedOut>
        <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0b0f19' }}>
          <SignIn />
        </Box>
      </SignedOut>

      <SignedIn>
        <AuthSync>
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <AppBar position="static" elevation={0} sx={{ backgroundColor: '#0b0f19', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Toolbar sx={{ minHeight: 56 }}>
                  <Typography variant="body1" component="div" sx={{ flexGrow: 1, color: 'text.secondary', fontSize: 14 }}>
                    Financial Disbursement Platform
                  </Typography>
                  <div>
                    <IconButton size="small" onClick={handleMenu} color="inherit">
                      <Avatar sx={{ bgcolor: 'secondary.main', width: 34, height: 34, fontSize: 14 }}>{user?.name?.charAt(0).toUpperCase()}</Avatar>
                    </IconButton>
                    <Menu id="menu-appbar" anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                      <MenuItem disabled>Change Role (UI Demo)</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('DEV')}>👨‍💻 Developer</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('EMP')}>👤 Employee</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('VRF', 'Rup')}>👁️ Verifier - Rup (Tech)</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('VRF', 'Samaja')}>👁️ Verifier - Samaja (Content)</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('FIN')}>💼 Finance (Yash)</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('OWN')}>👑 Owner (Debojit)</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('ADM')}>🛡️ Admin</MenuItem>
                      <MenuItem onClick={() => changeRoleLocal('VND')}>🏪 Vendor</MenuItem>
                      <MenuItem><SignOutButton /></MenuItem>
                    </Menu>
                  </div>
                </Toolbar>
              </AppBar>
              <Box component="main" sx={{ flexGrow: 1, p: 3, backgroundColor: '#0b0f19', overflow: 'auto' }}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/submit" element={<SubmitRequest />} />
                  <Route path="/subscriptions" element={<SubscriptionTracker />} />
                  <Route path="/employee-dashboard" element={<EmployeeDashboard />} />
                  <Route path="/worksheet" element={<WorksheetForm />} />
                  <Route path="/finance" element={<FinanceReview />} />
                  <Route path="/worksheets-admin" element={<WorksheetAdmin />} />
                  <Route path="/tech-dashboard" element={<TechDashboard />} />
                  <Route path="/content-dashboard" element={<ContentDashboard />} />
                </Routes>
              </Box>
            </Box>
          </Box>
        </AuthSync>
      </SignedIn>
    </>
  );
}

export default App;
