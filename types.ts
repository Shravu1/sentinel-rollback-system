
export enum DeploymentStatus {
  ACTIVE = 'ACTIVE',
  ROLLED_BACK = 'ROLLED_BACK',
  FAILED = 'FAILED',
  PREVIOUS = 'PREVIOUS',
  PENDING = 'PENDING'
}

export interface Deployment {
  id: string;
  version: string;
  timestamp: string;
  status: DeploymentStatus;
  author: string;
  commitHash: string;
  environment: string;
  healthScore: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  service: string;
  isSuspect?: boolean;
}

export interface MetricPoint {
  time: string;
  cpu: number;
  memory: number;
  latency: number;
  errors: number;
  baselineLatency?: number;
}

export interface AnalysisResult {
  riskScore: number;
  recommendation: 'STAY' | 'ROLLBACK' | 'INVESTIGATE';
  reasoning: string;
  confidence: number;
  suggestedVersion?: string;
  suspectLogIndices?: number[];
  detectedAnomalies?: string[];
  impactAssessment?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface FaultState {
  latencySpike: boolean;
  errorBurst: boolean;
  memoryLeak: boolean;
}

export interface IncidentReport {
  incidentId: string;
  timestamp: string;
  failedVersion: string;
  restoredVersion: string;
  rootCause: string;
  summary: string;
  metricsAtFailure: MetricPoint;
  resolutionTime: string;
}
