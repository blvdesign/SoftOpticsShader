type CodeExampleProps = {
  code: string;
  label: string;
};

export function CodeExample({ code, label }: CodeExampleProps) {
  return (
    <figure className="code-example">
      <figcaption>
        <span>{label}</span>
        <span>TypeScript</span>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
