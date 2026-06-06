// Minimal ambient declaration — moment-hijri ships no types. We only use the
// Hijri-string parsing factory and a couple of instance methods.
declare module "moment-hijri" {
    interface MomentHijri {
        isValid(): boolean;
        toDate(): Date;
        format(format?: string): string;
    }
    function momentHijri(input: string, format: string): MomentHijri;
    function momentHijri(input?: Date | number): MomentHijri;
    export = momentHijri;
}
