import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MergedChangesViewer from './MergedChangesViewer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function CorrectionViewer() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchCorrection(parseInt(id));
    }
  }, [id]);

  const fetchCorrection = async (correctionId) => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/corrections/${correctionId}`);
      if (!response.ok) throw new Error('Failed to fetch correction');
      const data = await response.json();
      setCorrection(data);
    } catch (err) {
      setError(`Error loading correction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laddar correction...</div>
      </div>
    );
  }

  if (error || !correction) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← Tillbaka
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error || 'Correction hittades inte'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Extract title from first line
  const title = correction.original_article.split('\n')[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Tillbaka
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {title || 'Correction Detail'}
          </h1>
          {correction.article_url && (
            <div className="text-sm text-blue-600 mb-4">
              {correction.article_url}
            </div>
          )}

          {/* Content Comparison */}
          <MergedChangesViewer
            correction={correction}
          />
        </div>
      </div>
    </div>
  );
}
