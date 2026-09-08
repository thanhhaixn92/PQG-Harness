type ReactApi = {
  createElement: (...args: any[]) => any
}

const React = require('react') as ReactApi

export interface ProductStateProps {
  title?: string
  description?: string
}

function ProductState({ title, description }: Required<ProductStateProps>) {
  return React.createElement(
    'section',
    {
      'data-pqg-product-state': title,
      style: {
        display: 'grid',
        gap: 8,
        placeItems: 'center',
        minHeight: 220,
        maxWidth: 720,
        margin: '24px auto',
        padding: 32,
        textAlign: 'center',
        color: 'var(--mantine-color-text, #172033)',
        background: 'var(--mantine-color-white, #ffffff)',
        border: '1px solid var(--mantine-color-gray-2, #e9ecef)',
        borderRadius: 12,
      },
    },
    React.createElement('strong', { style: { fontSize: 16 } }, title),
    React.createElement(
      'span',
      { style: { color: 'var(--mantine-color-dimmed, #667085)', fontSize: 14 } },
      description,
    ),
  )
}

export function LoadingState(props: ProductStateProps = {}) {
  return React.createElement(ProductState, {
    title: props.title ?? 'Đang tải',
    description: props.description ?? 'Nội dung đang được chuẩn bị.',
  })
}

export function EmptyState(props: ProductStateProps = {}) {
  return React.createElement(ProductState, {
    title: props.title ?? 'Chưa có nội dung',
    description: props.description ?? 'Nội dung sẽ xuất hiện tại đây khi sẵn sàng.',
  })
}

export function ErrorState(props: ProductStateProps = {}) {
  return React.createElement(ProductState, {
    title: props.title ?? 'Không thể hiển thị nội dung',
    description: props.description ?? 'Vui lòng thử lại sau.',
  })
}

export function UnavailableState(props: ProductStateProps = {}) {
  return React.createElement(ProductState, {
    title: props.title ?? 'Chưa khả dụng',
    description: props.description ?? 'Chức năng này hiện chưa sẵn sàng.',
  })
}
