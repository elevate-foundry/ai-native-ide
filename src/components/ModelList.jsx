import React, { useEffect, useState } from 'react';

const ModelList = () => {
  const [models, setModels] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': window.location.origin,
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch models');
        
        const data = await response.json();
        setModels(data.data || []);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchModels();
    // Refresh every 5 minutes
    const interval = setInterval(fetchModels, 300000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed top-0 right-0 p-4 bg-black bg-opacity-75 text-white max-h-screen overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Available Models</h2>
      {error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <ul className="space-y-2">
          {models.map((model) => (
            <li key={model.id} className="text-sm">
              <div className="font-medium">{model.id}</div>
              <div className="text-xs opacity-75">
                Context: {model.context_length} | {model.pricing?.prompt?.toFixed(6)} per 1k tokens
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ModelList;