export interface AdminUser {
    id: string;
    email: string;
    name: string;
    progressPercentage: number;
    lastUpdated: string;
    status: string;
    currentModule: string;
    pipelineStage?: string;
}

export interface AdminAudioRecording {
    id: string;
    user_id: string;
    module: string;
    question_id: string;
    file_path: string;
    transcript: string | null;
    duration_seconds: number | null;
    created_at: string;
}

export interface AdminUploadedFile {
    id: string;
    user_id: string;
    category: string;
    file_name: string;
    file_type: string | null;
    file_size: number | null;
    created_at: string;
}

export interface AdminUserDetails {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    progressPercentage: number;
    lastUpdated: string;
    status: string;
    submittedAt: string | null;
    currentModule: string;
    currentStep: number;
    diagnosticData: {
        preModule: Record<string, any>;
        mentor: Record<string, any>;
        mentee: Record<string, any>;
        method: Record<string, any>;
        offer: Record<string, any>;
    };
}

export interface PipelineUser {
    userId: string;
    name: string;
    email: string;
    diagnosticStatus: string;
    researchStatus: string;
    brandBrainStatus: string;
    assetsStatus: string;
    lastUpdated: string;
}

export interface PipelineDetail {
    name: string;
    email: string;
    diagnosticStatus: string;
    researchDossier: any;
    researchStatus: string;
    researchCompletedAt: string | null;
    brandBrain: any;
    brandBrainStatus: string;
    brandBrainVersion: number;
    brandBrainCompletedAt: string | null;
    expertNotes: Record<string, string> | null;
    assets: any;
    assetsStatus: string;
    assetsDeliveredAt: string | null;
    educationalSuggestions: Record<string, any[]> | null;
}

export type BadgeColor = 'gray' | 'yellow' | 'blue' | 'purple' | 'green';

export interface ToastState {
    message: string;
    type: 'success' | 'error';
}
