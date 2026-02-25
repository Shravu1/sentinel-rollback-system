
import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend 
} from 'recharts';
import { MetricPoint } from '../types';

interface HealthChartProps {
  data: MetricPoint[];
}

const HealthChart: React.FC<HealthChartProps> = ({ data }) => {
  return (
    <div className="w-full h-64 bg-slate-800/50 rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">System Performance</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="time" 
            stroke="#94a3b8" 
            fontSize={12} 
            tickFormatter={(val) => val.split(':')[1] + 's'}
          />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            itemStyle={{ fontSize: '12px' }}
          />
          <Area 
            type="monotone" 
            dataKey="latency" 
            stroke="#818cf8" 
            fillOpacity={1} 
            fill="url(#colorLatency)" 
            name="Latency (ms)"
          />
          <Area 
            type="monotone" 
            dataKey="errors" 
            stroke="#f87171" 
            fillOpacity={1} 
            fill="url(#colorErrors)" 
            name="Error Rate"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HealthChart;
