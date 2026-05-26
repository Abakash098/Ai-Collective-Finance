import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import store from './store';
import theme from './theme';
import App from './App';

import { ClerkProvider } from '@clerk/clerk-react';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Use the publishable key from the original index.html
const clerkPubKey = 'pk_test_d29ya2luZy1naWJib24tOTQuY2xlcmsuYWNjb3VudHMuZGV2JA';

root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPubKey}>
      <Provider store={store}>
        <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
        </ThemeProvider>
      </Provider>
    </ClerkProvider>
  </React.StrictMode>
);
