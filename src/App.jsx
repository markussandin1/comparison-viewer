import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ArticlesList from './ArticlesList';
import ArticleDetail from './ArticleDetail';
import CorrectionViewer from './CorrectionViewer';
import MultiRunComparison from './MultiRunComparison';

export default function App() {
  return (
    <Routes>
      {/* New article-centric routes */}
      <Route path="/" element={<ArticlesList />} />
      <Route path="/article/:url" element={<ArticleDetail />} />
      <Route path="/article/:url/compare" element={<MultiRunComparison />} />

      {/* Correction detail with flexible comparison */}
      <Route path="/correction/:id" element={<CorrectionViewer />} />
    </Routes>
  );
}
