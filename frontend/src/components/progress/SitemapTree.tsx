import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Network, Lock, Folder, FileText, Globe } from "lucide-react";

interface TreeNode {
  name: string;
  children: Record<string, TreeNode>;
  isPage: boolean;
  priority?: number;
  isAuth: boolean;
}

const AUTH_PATTERNS = [
  "/login",
  "/signin",
  "/signup",
  "/register",
  "/auth",
  "/oauth",
  "/sso",
  "/admin",
  "/dashboard",
  "/account",
  "/profile",
  "/settings",
  "/api/",
  "/webhook",
  "/callback",
  "/logout",
  "/signout",
];

export function SitemapTree() {
  const sitemapUrls = useAppStore((s) => s.sitemapUrls);
  const sitemapSource = useAppStore((s) => s.sitemapSource);
  const sitemapTotalPages = useAppStore((s) => s.sitemapTotalPages);

  // Build tree structure
  const { tree, hostname } = useMemo(() => {
    const root: TreeNode = {
      name: "/",
      children: {},
      isPage: true,
      isAuth: false,
    };
    let host = "";

    sitemapUrls.forEach((url) => {
      try {
        const parsed = new URL(url.loc);
        if (!host) host = parsed.hostname;

        const path = parsed.pathname || "/";
        const parts = path.split("/").filter(Boolean);

        let current = root;
        parts.forEach((part, idx) => {
          if (!current.children[part]) {
            const fullPath = "/" + parts.slice(0, idx + 1).join("/");
            const isAuth = AUTH_PATTERNS.some((p) =>
              fullPath.toLowerCase().includes(p)
            );
            current.children[part] = {
              name: part,
              children: {},
              isPage: idx === parts.length - 1,
              priority: url.priority,
              isAuth,
            };
          }
          current = current.children[part];
        });
      } catch {
        // Skip invalid URLs
      }
    });

    return { tree: root, hostname: host };
  }, [sitemapUrls]);

  if (sitemapUrls.length === 0) return null;

  // Render tree recursively
  const renderNode = (
    node: TreeNode,
    prefix: string = "",
    isLast: boolean = true
  ): JSX.Element[] => {
    const children = Object.values(node.children);
    const elements: JSX.Element[] = [];

    children.forEach((child, idx) => {
      const isLastChild = idx === children.length - 1;
      const connector = isLastChild ? "└── " : "├── ";
      const hasChildren = Object.keys(child.children).length > 0;

      elements.push(
        <div
          key={`${prefix}-${child.name}`}
          className={cn(
            "flex items-center gap-2 py-0.5 px-2 rounded text-sm font-mono transition-colors hover:bg-secondary/50",
            child.isAuth && "opacity-40"
          )}
          title={child.isAuth ? "Auth-required page (will be skipped)" : undefined}
        >
          <span className="text-muted-foreground/50 select-none">
            {prefix}
            {connector}
          </span>
          {child.isAuth ? (
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          ) : hasChildren ? (
            <Folder className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-muted-foreground",
              child.isAuth && "line-through"
            )}
          >
            {child.name}
          </span>
          {child.priority !== undefined && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {child.priority.toFixed(1)}
            </Badge>
          )}
        </div>
      );

      // Recursively render children
      const newPrefix = prefix + (isLastChild ? "    " : "│   ");
      elements.push(...renderNode(child, newPrefix, isLastChild));
    });

    return elements;
  };

  return (
    <div className="border-t border-border/50 p-5 bg-gradient-to-b from-transparent to-blue-500/[0.02]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Network className="w-5 h-5 text-blue-400" />
        <span className="text-sm font-medium">Site Map</span>
        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="text-[10px] font-mono">
            {sitemapSource?.toUpperCase()}
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono">
            {sitemapTotalPages} pages
          </Badge>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="h-64 bg-background border border-border rounded-lg p-4">
        {/* Root */}
        <div className="flex items-center gap-2 py-1 px-2 text-sm font-mono font-medium border-b border-dashed border-border mb-2 pb-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-blue-400">{hostname || "site"}</span>
        </div>

        {/* Tree nodes */}
        {renderNode(tree)}
      </ScrollArea>
    </div>
  );
}
