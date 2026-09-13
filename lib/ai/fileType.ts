/** PDF는 브라우저/OS에 따라 MIME 타입이 비어있거나 잘못 붙는 경우가 있어, 확장자도 함께 본다. */
export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
