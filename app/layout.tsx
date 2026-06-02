import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "标签提取 Prompt 测试系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header>
          <h1>标签提取 Prompt 测试系统</h1>
          <nav>
            <Link href="/dictionaries">标签字典</Link>
            <Link href="/datasets">测试集</Link>
            <Link href="/prompts">Prompt</Link>
            <Link href="/models">模型配置</Link>
            <Link href="/runs/new">运行测试</Link>
            <Link href="/runs">测试结果</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
