export interface UserResponse {
    id: string;
    name: string;
    email: string;
    role: string | null;
    photo: string | null;
    bio: string | null;
    isVerified: boolean;
    token?: string;
}

export interface RegisterPayload {
    name: string;
    email: string;
    password: string;
}

export interface LoginPayload {
    email: string;
    password: string;
}
