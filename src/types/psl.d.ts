declare module 'psl' {
    interface ParsedDomain {
        input: string;
        tld: string | null;
        sld: string | null;
        domain: string | null;
        subdomain: string | null;
        listed: boolean;
        error?: unknown;
    }

    function parse(input: string): ParsedDomain;

    export { parse };
}
