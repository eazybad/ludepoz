import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Kampasika Biz (hostel / PBSA operators) lives at /biz with its own entry
// point. Its code is loaded on demand, so the student app's bundle and
// start-up are unchanged — only /biz downloads the Biz chunk.
const isBiz = window.location.pathname === '/biz' || window.location.pathname.startsWith('/biz/');

// One canonical URL per page for search engines (index.html is shared by
// every path). Biz sub-pages all point at /biz; everything else at itself.
const SITE_ORIGIN = 'https://kampasika.org';
const canonicalPath = isBiz ? '/biz' : (window.location.pathname || '/');
let canonicalLink = document.querySelector('link[rel="canonical"]');
if (!canonicalLink) {
  canonicalLink = document.createElement('link');
  canonicalLink.setAttribute('rel', 'canonical');
  document.head.appendChild(canonicalLink);
}
canonicalLink.setAttribute('href', SITE_ORIGIN + canonicalPath);

if (isBiz) {
  import('./biz/BizApp').then(({ default: BizApp }) => {
    root.render(
      <React.StrictMode>
        <BizApp />
      </React.StrictMode>
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
